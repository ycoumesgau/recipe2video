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
import type { ReferenceAsset } from "@/modules/references/reference.types";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import type { SegmentStatus } from "@/modules/storyboard/segment-status";
import type { VideoProject } from "@/modules/videos/video.types";
import type { VideoStatus } from "@/modules/videos/video-status";
import {
  RUNWAY_DEFAULT_VIDEO_RATIO,
  RUNWAY_SEEDANCE2_CREDITS_PER_SECOND,
} from "../runway.constants";

const MAX_SEEDANCE_REFERENCE_INPUTS = 9;

interface WorkflowAuthData {
  requestedByUserId: string;
  /**
   * Legacy flag kept for backward compatibility with existing event payloads
   * and unit tests. The real allowlist check must be performed by the Inngest
   * handler via `assertAllowlistedUser(data.requestedByUserId)` before this
   * use-case is invoked. We never trust this field in production code.
   */
  isAllowlisted?: boolean;
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
  listReferenceAssetsForVideo(videoId: string): Promise<ReferenceAsset[]>;
  startSeedanceGeneration(input: SeedanceGenerationInput): Promise<RunwayTask>;
  createGeneration(input: CreateGenerationInput): Promise<Generation>;
  logCost(input: CreateCostLogInput): Promise<CostLog>;
}

export interface PollSegmentGenerationDeps extends SegmentWorkflowBaseDeps {
  getGenerationById(generationId: string): Promise<Generation | null>;
  getSegmentById(segmentId: string): Promise<SeedanceSegment | null>;
  getRunwayTask(taskId: string): Promise<RunwayTaskStatus>;
  updateGenerationStatus(input: UpdateGenerationStatusInput): Promise<Generation>;
  /**
   * Optional cost logger so the workflow can record the actual Runway credits
   * spent when a Seedance task reaches `SUCCEEDED`. The Inngest handler wires
   * the real Supabase-backed implementation; tests can omit it.
   */
  logCost?(input: CreateCostLogInput): Promise<CostLog>;
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
  const references = await deps.listReferenceAssetsForVideo(segment.videoId);
  const generationSegment = resolveSegmentReferences(segment, references);

  // Block instead of "failed" when references are not ready: this is a user
  // checkpoint (approve + upload kitchen reference), not a Runway failure.
  try {
    assertSegmentReferencesReady(generationSegment);
  } catch (referenceError) {
    await deps.updateSegmentStatus(segment.id, "blocked");
    throw referenceError;
  }

  await deps.updateSegmentStatus(segment.id, "queued");

  try {
    const generationInput = buildSeedanceGenerationInput(generationSegment);
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
        referenceCount: getSeedanceReferenceInputCount(generationInput),
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

    // Persist a "succeeded" cost log so the dashboard can distinguish the
    // estimated-at-launch cost from the realised credits. Runway does not
    // expose the actual credit consumption per task today, so we re-use the
    // estimate (`generation.costCredits`) and tag the metadata accordingly.
    if (deps.logCost) {
      await deps.logCost({
        videoId: segment.videoId,
        segmentId: segment.id,
        provider: "runway",
        model: generation.model,
        operation: "seedance_segment_generation_succeeded",
        creditsUsed: generation.costCredits ?? null,
        metadata: {
          generationId: generation.id,
          runwayTaskId: taskId,
          actualCreditsAvailable: false,
          estimated: true,
        },
        createdBy: data.requestedByUserId,
      });
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
    ratio: RUNWAY_DEFAULT_VIDEO_RATIO,
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

function resolveSegmentReferences(
  segment: SeedanceSegment,
  referenceAssets: ReferenceAsset[],
): SeedanceSegment {
  return {
    ...segment,
    references: segment.references.map((segmentReference) => {
      if (segmentReference.runwayUri) {
        return segmentReference;
      }

      const referenceAsset = findMatchingReferenceAsset(
        referenceAssets,
        segmentReference,
      );

      return {
        ...segmentReference,
        id: segmentReference.id ?? referenceAsset?.id,
        runwayUri: referenceAsset?.runwayUri ?? null,
        mediaAssetId: segmentReference.mediaAssetId ?? referenceAsset?.mediaAssetId,
      };
    }),
  };
}

function findMatchingReferenceAsset(
  referenceAssets: ReferenceAsset[],
  segmentReference: SeedanceSegment["references"][number],
) {
  return referenceAssets.find((referenceAsset) =>
    doesReferenceAssetMatchSegmentReference(referenceAsset, segmentReference),
  );
}

function doesReferenceAssetMatchSegmentReference(
  referenceAsset: ReferenceAsset,
  segmentReference: SeedanceSegment["references"][number],
) {
  if (segmentReference.id && segmentReference.id === referenceAsset.id) {
    return true;
  }

  const referenceKeys = [
    referenceAsset.canonicalName,
    referenceAsset.type,
    referenceAsset.id,
  ].map(normalizeReferenceKey);
  const segmentKeys = [
    segmentReference.name,
    segmentReference.label,
    segmentReference.role,
  ].map(normalizeReferenceKey);

  return segmentKeys.some(
    (key) => key.length > 0 && referenceKeys.includes(key),
  );
}

function assertWorkflowAllowed(data: WorkflowAuthData) {
  // Sanity check on the event payload only. The Inngest handler must call
  // assertAllowlistedUser(data.requestedByUserId) against Supabase before
  // invoking this workflow; we no longer trust the `isAllowlisted` flag.
  if (!data.requestedByUserId) {
    throw new Error("Workflow requires a triggering user ID.");
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

/**
 * Enforce the references discipline from `.cursor/rules/recipe2video-seedance-segments.mdc`
 * and the PRD: every Seedance segment needs at least one reference uploaded
 * to Runway, and a global kitchen reference (typically `@KitchenIslandDefault`)
 * is mandatory. If any of these is missing, the segment must be blocked rather
 * than generated without references.
 */
function assertSegmentReferencesReady(segment: SeedanceSegment) {
  if (segment.references.length > MAX_SEEDANCE_REFERENCE_INPUTS) {
    throw new Error(
      `Segment ${segment.id} has ${segment.references.length} Seedance reference inputs; Seedance supports at most 9.`,
    );
  }

  const requiredReferences = segment.references.filter(
    (reference) => reference.required !== false,
  );
  const missingRunwayReferences = requiredReferences.filter(
    (reference) => !reference.runwayUri,
  );

  if (requiredReferences.length === 0 || missingRunwayReferences.length > 0) {
    throw new Error(
      `Segment ${segment.id} has required references not uploaded to Runway: ${missingRunwayReferences.map((reference) => reference.label || reference.name).join(", ") || "none planned"}. Approve and upload references before generation.`,
    );
  }

  const hasKitchenReference = requiredReferences.some((reference) => {
    const haystack = [
      reference.name ?? "",
      reference.label ?? "",
      reference.role ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes("kitchen") || haystack.includes("island");
  });

  if (!hasKitchenReference) {
    throw new Error(
      `Segment ${segment.id} is missing a global kitchen reference (e.g. @KitchenIslandDefault). Upload it to Runway before generation.`,
    );
  }
}

function getSeedanceReferenceInputCount(input: SeedanceGenerationInput) {
  return (
    (typeof input.promptImage === "string" ? 1 : 0) +
    (input.references?.length ?? 0)
  );
}

function normalizeReferenceKey(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function estimateSeedanceCredits(durationSeconds: number) {
  return Math.ceil(durationSeconds * RUNWAY_SEEDANCE2_CREDITS_PER_SECOND);
}

export function workflowStatusForRecipeResult(input: {
  clarifyingQuestionCount: number;
}): VideoStatus {
  return input.clarifyingQuestionCount > 0
    ? "clarification_needed"
    : "recipe_ingested";
}
