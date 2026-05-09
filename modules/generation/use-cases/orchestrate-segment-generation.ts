import type { CostLog, CreateCostLogInput } from "@/modules/costs/cost.types";
import type {
  CreateGenerationInput,
  Generation,
  UpdateGenerationStatusInput,
} from "@/modules/generation/generation.types";
import type {
  RunwaySeedanceReference,
  RunwayTask,
  RunwayTaskStatus,
  SeedanceGenerationInput,
} from "@/modules/generation/runway.types";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import type { SegmentStatus } from "@/modules/storyboard/segment-status";
import type { VideoProject } from "@/modules/videos/video.types";
import type { VideoStatus } from "@/modules/videos/video-status";

const SEEDANCE2_CREDITS_PER_SECOND = 36;

interface WorkflowAuthData {
  requestedByUserId: string;
  isAllowlisted: boolean;
}

export interface SegmentGenerationRequestedData extends WorkflowAuthData {
  segmentId: string;
}

export interface SegmentGenerationPollRequestedData extends WorkflowAuthData {
  generationId: string;
  taskId: string;
}

export interface SegmentOutputPersistRequestedData extends WorkflowAuthData {
  generationId: string;
  outputUrl: string;
}

export interface SegmentMuxUploadRequestedData extends WorkflowAuthData {
  mediaAssetId: string;
}

export interface WorkflowEvent {
  name:
    | "segment.generation.poll.requested"
    | "segment.output.persist.requested"
    | "segment.mux.upload.requested";
  data: Record<string, unknown>;
}

interface SegmentWorkflowBaseDeps {
  updateSegmentStatus(
    segmentId: string,
    status: SegmentStatus,
  ): Promise<SeedanceSegment>;
  sendEvent(event: WorkflowEvent): Promise<void>;
}

export interface RequestSegmentGenerationDeps extends SegmentWorkflowBaseDeps {
  isGenerationQueuePaused(): boolean;
  getSegmentById(segmentId: string): Promise<SeedanceSegment | null>;
  getVideoProjectById(videoId: string): Promise<VideoProject | null>;
  startSeedanceGeneration(input: SeedanceGenerationInput): Promise<RunwayTask>;
  createGeneration(input: CreateGenerationInput): Promise<Generation>;
  logCost(input: CreateCostLogInput): Promise<CostLog>;
}

export interface PollSegmentGenerationDeps extends SegmentWorkflowBaseDeps {
  getGenerationById(generationId: string): Promise<Generation | null>;
  getSegmentById(segmentId: string): Promise<SeedanceSegment | null>;
  getRunwayTask(taskId: string): Promise<RunwayTaskStatus>;
  updateGenerationStatus(input: UpdateGenerationStatusInput): Promise<Generation>;
  now(): string;
}

export interface PersistSegmentOutputDeps extends SegmentWorkflowBaseDeps {
  getGenerationById(generationId: string): Promise<Generation | null>;
  getSegmentById(segmentId: string): Promise<SeedanceSegment | null>;
  persistRunwayOutput(input: {
    outputUrl: string;
    videoId: string;
    segmentId: string;
    generationId: string;
    createdBy?: string | null;
    originalFilename?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<MediaAsset>;
  updateGenerationStatus(input: UpdateGenerationStatusInput): Promise<Generation>;
  now(): string;
}

export interface UploadSegmentMuxDeps {
  uploadMediaAssetToMux(mediaAssetId: string): Promise<unknown>;
}

export async function requestSegmentGenerationWorkflow(
  data: SegmentGenerationRequestedData,
  deps: RequestSegmentGenerationDeps,
): Promise<{ generationId?: string; runwayTaskId?: string; paused?: boolean }> {
  assertWorkflowAllowed(data);

  const segment = await requireSegment(deps.getSegmentById, data.segmentId);
  const video = await requireVideo(deps.getVideoProjectById, segment.videoId);

  if (deps.isGenerationQueuePaused()) {
    await deps.updateSegmentStatus(segment.id, "blocked");
    return { paused: true };
  }

  assertSeedance2Selected(video);
  await deps.updateSegmentStatus(segment.id, "queued");

  try {
    const generationInput = buildSeedanceGenerationInput(segment);
    const runwayTask = await deps.startSeedanceGeneration(generationInput);
    const costCredits = estimateSeedanceCredits(segment.durationTarget);
    const generation = await deps.createGeneration({
      segmentId: segment.id,
      model: video.selectedVideoModel,
      modelParams: {
        endpoint: runwayTask.endpoint,
        promptText: generationInput.promptText,
        durationSeconds: generationInput.durationSeconds,
        ratio: generationInput.ratio,
        referenceCount: generationInput.references?.length ?? 0,
      },
      runwayTaskId: runwayTask.id,
      status: runwayTask.generationStatus ?? "queued",
      costCredits,
      durationSeconds: segment.durationTarget,
      triggeredBy: data.requestedByUserId,
    });

    await deps.updateSegmentStatus(segment.id, "generating");
    await deps.logCost({
      videoId: segment.videoId,
      segmentId: segment.id,
      provider: "runway",
      model: video.selectedVideoModel,
      operation: "seedance_segment_generation_started",
      creditsUsed: costCredits,
      metadata: {
        generationId: generation.id,
        runwayTaskId: runwayTask.id,
        endpoint: runwayTask.endpoint,
        estimated: true,
      },
      createdBy: data.requestedByUserId,
    });
    await deps.sendEvent({
      name: "segment.generation.poll.requested",
      data: {
        generationId: generation.id,
        taskId: runwayTask.id,
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: true,
      },
    });

    return { generationId: generation.id, runwayTaskId: runwayTask.id };
  } catch (error) {
    await deps.updateSegmentStatus(segment.id, "failed");
    throw error;
  }
}

export async function pollSegmentGenerationWorkflow(
  data: SegmentGenerationPollRequestedData,
  deps: PollSegmentGenerationDeps,
): Promise<{ terminal: boolean; status: RunwayTaskStatus["status"] }> {
  assertWorkflowAllowed(data);

  const generation = await requireGeneration(deps.getGenerationById, data.generationId);
  const segment = await requireSegment(deps.getSegmentById, generation.segmentId);
  const taskId = generation.runwayTaskId ?? data.taskId;

  if (!taskId) {
    await deps.updateGenerationStatus({
      generationId: generation.id,
      status: "failed",
      completedAt: deps.now(),
    });
    await deps.updateSegmentStatus(segment.id, "failed");
    throw new Error("Generation is missing a Runway task ID.");
  }

  if (generation.status === "queued" || generation.status === "pending") {
    await deps.updateGenerationStatus({
      generationId: generation.id,
      status: "processing",
    });
  }

  const task = await deps.getRunwayTask(taskId);
  await deps.updateGenerationStatus({
    generationId: generation.id,
    status: task.generationStatus,
    completedAt: task.isTerminal ? deps.now() : undefined,
  });

  if (task.status === "SUCCEEDED") {
    const outputUrl = task.output?.[0];
    if (!outputUrl) {
      await deps.updateGenerationStatus({
        generationId: generation.id,
        status: "failed",
        completedAt: deps.now(),
      });
      await deps.updateSegmentStatus(segment.id, "failed");
      throw new Error("Succeeded Runway task did not include an output URL.");
    }

    await deps.sendEvent({
      name: "segment.output.persist.requested",
      data: {
        generationId: generation.id,
        outputUrl,
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: true,
      },
    });

    return { terminal: true, status: task.status };
  }

  if (task.status === "FAILED" || task.status === "CANCELLED") {
    await deps.updateSegmentStatus(segment.id, "failed");
    return { terminal: true, status: task.status };
  }

  await deps.sendEvent({
    name: "segment.generation.poll.requested",
    data: {
      generationId: generation.id,
      taskId,
      requestedByUserId: data.requestedByUserId,
      isAllowlisted: true,
    },
  });

  return { terminal: false, status: task.status };
}

export async function persistSegmentOutputWorkflow(
  data: SegmentOutputPersistRequestedData,
  deps: PersistSegmentOutputDeps,
): Promise<{ mediaAssetId: string }> {
  assertWorkflowAllowed(data);

  const generation = await requireGeneration(deps.getGenerationById, data.generationId);
  const segment = await requireSegment(deps.getSegmentById, generation.segmentId);

  try {
    const mediaAsset = await deps.persistRunwayOutput({
      outputUrl: data.outputUrl,
      videoId: segment.videoId,
      segmentId: segment.id,
      generationId: generation.id,
      createdBy: data.requestedByUserId,
      originalFilename: `${generation.id}.mp4`,
      metadata: {
        runwayTaskId: generation.runwayTaskId,
      },
    });

    await deps.updateGenerationStatus({
      generationId: generation.id,
      status: "succeeded",
      mediaAssetId: mediaAsset.id,
      completedAt: deps.now(),
    });
    await deps.updateSegmentStatus(segment.id, "review");
    await deps.sendEvent({
      name: "segment.mux.upload.requested",
      data: {
        mediaAssetId: mediaAsset.id,
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: true,
      },
    });

    return { mediaAssetId: mediaAsset.id };
  } catch (error) {
    await deps.updateGenerationStatus({
      generationId: generation.id,
      status: "failed",
      completedAt: deps.now(),
    });
    await deps.updateSegmentStatus(segment.id, "failed");
    throw error;
  }
}

export async function uploadSegmentMuxWorkflow(
  data: SegmentMuxUploadRequestedData,
  deps: UploadSegmentMuxDeps,
): Promise<void> {
  assertWorkflowAllowed(data);
  await deps.uploadMediaAssetToMux(data.mediaAssetId);
}

export function buildSeedanceGenerationInput(
  segment: SeedanceSegment,
): SeedanceGenerationInput {
  const references = buildRunwayReferences(segment);
  const [promptImageReference, ...remainingReferences] = references;

  return {
    promptText: segment.prompt,
    durationSeconds: segment.durationTarget,
    ratio: "720:1280",
    promptImage: promptImageReference?.uri,
    references: remainingReferences.length > 0 ? remainingReferences : undefined,
  };
}

function buildRunwayReferences(segment: SeedanceSegment): RunwaySeedanceReference[] {
  return segment.references.flatMap((reference) =>
    reference.runwayUri
      ? [
          {
            type: "image" as const,
            uri: reference.runwayUri,
          },
        ]
      : [],
  );
}

function assertWorkflowAllowed(data: WorkflowAuthData) {
  if (!data.requestedByUserId || !data.isAllowlisted) {
    throw new Error("Workflow requires an authenticated allowlisted user.");
  }
}

async function requireSegment(
  getSegmentById: (segmentId: string) => Promise<SeedanceSegment | null>,
  segmentId: string,
) {
  const segment = await getSegmentById(segmentId);
  if (!segment) {
    throw new Error(`Segment ${segmentId} not found.`);
  }

  return segment;
}

async function requireVideo(
  getVideoProjectById: (videoId: string) => Promise<VideoProject | null>,
  videoId: string,
) {
  const video = await getVideoProjectById(videoId);
  if (!video) {
    throw new Error(`Video ${videoId} not found.`);
  }

  return video;
}

async function requireGeneration(
  getGenerationById: (generationId: string) => Promise<Generation | null>,
  generationId: string,
) {
  const generation = await getGenerationById(generationId);
  if (!generation) {
    throw new Error(`Generation ${generationId} not found.`);
  }

  return generation;
}

function assertSeedance2Selected(video: VideoProject) {
  if (video.selectedVideoModel !== "seedance2") {
    throw new Error(
      `Selected video model ${video.selectedVideoModel} is not supported by this Seedance workflow. No fallback was used.`,
    );
  }
}

function estimateSeedanceCredits(durationSeconds: number) {
  return Math.ceil(durationSeconds * SEEDANCE2_CREDITS_PER_SECOND);
}

export function workflowStatusForRecipeResult(input: {
  clarifyingQuestionCount: number;
}): VideoStatus {
  return input.clarifyingQuestionCount > 0
    ? "clarification_needed"
    : "recipe_ingested";
}
