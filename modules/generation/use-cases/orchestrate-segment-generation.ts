import type { CostLog, CreateCostLogInput } from "@/modules/costs/cost.types";
import { refundRunwaySegmentGenerationCost } from "@/modules/costs/refund-runway-generation-cost";
import { RUNWAY_SEGMENT_GENERATION_STARTED } from "@/modules/costs/runway-cost-operations";
import type {
  CreateGenerationInput,
  Generation,
  UpdateGenerationStatusInput,
} from "@/modules/generation/generation.types";
import type {
  RunwaySeedanceReference,
  RunwaySeedanceVideoReference,
  RunwayTask,
  RunwayTaskStatus,
  SeedanceGenerationInput,
} from "@/modules/generation/runway.types";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import {
  buildMatchableNameSet,
  normalizeReferenceName,
} from "@/modules/references/reference-matching";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import {
  segmentStatusAfterFailedGeneration,
  type SegmentStatus,
} from "@/modules/storyboard/segment-status";
import type { VideoProject } from "@/modules/videos/video.types";
import type { VideoStatus } from "@/modules/videos/video-status";
import {
  RUNWAY_DEFAULT_VIDEO_RATIO,
  RUNWAY_MAX_REFERENCE_BYTES,
  RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES,
  RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES_TOTAL_SECONDS,
  RUNWAY_SEEDANCE2_CREDITS_PER_SECOND,
  RUNWAY_SEEDANCE2_MAX_DURATION_SECONDS,
  RUNWAY_SEEDANCE2_MIN_DURATION_SECONDS,
} from "../runway.constants";
import { normalizeRunwayProgress } from "../runway-progress-normalize";

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
  nextPollDelaySeconds?: number;
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

/**
 * Descriptor of a reference that the planner declared as
 * `extracted_frame_pending`. The orchestrator refuses generation when
 * any such row is wired to the segment until the operator extracts the
 * upstream frame via the segment-review UI and the row is upgraded to
 * `extracted_frame`.
 */
export interface PendingExtractedFrameDescriptor {
  referenceAssetId: string;
  canonicalName: string;
  sourceSegmentId: string | null;
  sourceTimestampSeconds: number | null;
}

export interface RequestSegmentGenerationDeps extends SegmentWorkflowBaseDeps {
  isGenerationQueuePaused(): boolean;
  hasActiveGenerationForSegment(segmentId: string): Promise<boolean>;
  getSegmentById(segmentId: string): Promise<SeedanceSegment | null>;
  getVideoProjectById(videoId: string): Promise<VideoProject | null>;
  /**
   * Returns the FINAL Runway reference inputs for the segment, with brand new
   * signed URLs generated at call time. The pipeline never stores these URLs:
   * `segment_references` is the source of truth, and the resolver re-issues a
   * fresh URL on every retry so a segment regenerated hours or days later
   * never fails on an expired link.
   */
  resolveSegmentSeedanceReferences(
    segmentId: string,
  ): Promise<SegmentSeedanceReferenceInput[]>;
  /**
   * Returns the list of references this segment is still waiting on,
   * because they were declared as `extracted_frame_pending` placeholders
   * by the planner. When non-empty, the orchestrator flips the segment
   * status to `awaiting_upstream_frame` and refuses generation.
   * Optional so existing call sites (and unit tests) keep compiling
   * without wiring new IO; defaults to "no pending frames" if omitted.
   */
  findPendingExtractedFrames?(
    segmentId: string,
  ): Promise<PendingExtractedFrameDescriptor[]>;
  startSeedanceGeneration(input: SeedanceGenerationInput): Promise<RunwayTask>;
  createGeneration(input: CreateGenerationInput): Promise<Generation>;
  logCost(input: CreateCostLogInput): Promise<CostLog>;
}

/**
 * Resolved, ready-to-call Seedance reference input. Mirrors the just-in-time
 * resolver's output in `modules/references/use-cases/resolve-segment-seedance-references.ts`.
 * Mirrored here (rather than imported) so this use-case stays pure and unit
 * tests don't need to import server-only code.
 */
export interface SegmentSeedanceReferenceInput {
  position: number;
  role: string;
  required: boolean;
  canonicalName: string;
  /**
   * Alternative names this reference is also known by (asset_library aliases
   * for library entries, empty for recipe-specific entries). Required so the
   * validator can match against the alias the agent wrote in
   * `segments.references[].name` (e.g. `KitchenIslandDefault`) rather than
   * forcing every consumer to know the storage canonical (`island_default`).
   */
  aliases?: string[];
  uri: string;
  source: "asset_library" | "reference_assets";
  /**
   * Whether this reference is an image or a video. Drives the orchestrator
   * split between Seedance `references[]` (images) and `referenceVideos[]`
   * (videos) on `text_to_video`. Optional in the type so legacy/test
   * inputs default to `image`; production resolver always sets it.
   */
  kind?: "image" | "video";
  /**
   * Duration of the underlying media in seconds, surfaced for video
   * references so the validator can enforce the combined 15s cap.
   * Optional/null for images and for video assets without a recorded
   * duration.
   */
  durationSeconds?: number | null;
  /**
   * Stored byte size of the underlying media. Used by the pre-flight guard
   * to refuse generations whose references exceed Runway's 16 MB-per-asset
   * cap. Optional so unit tests that exercise unrelated logic don't have to
   * fabricate it; missing or 0 means "unknown" and the guard is skipped.
   */
  fileSizeBytes?: number;
  /** Stored MIME type of the underlying media (used for error hints). */
  mimeType?: string | null;
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
): Promise<{
  generationId?: string;
  runwayTaskId?: string;
  paused?: boolean;
  alreadyActive?: boolean;
}> {
  assertWorkflowAllowed(data);

  const segment = await requireSegment(deps.getSegmentById, data.segmentId);
  const video = await requireVideo(deps.getVideoProjectById, segment.videoId);

  if (deps.isGenerationQueuePaused()) {
    await deps.updateSegmentStatus(segment.id, "blocked");
    return { paused: true };
  }

  if (await deps.hasActiveGenerationForSegment(segment.id)) {
    // Idempotence guard: multiple clicks (or duplicate events) should never
    // spawn parallel paid Runway tasks for the same segment.
    return { alreadyActive: true };
  }

  assertSeedance2Selected(video);

  // Refuse generation when any reference is still an
  // `extracted_frame_pending` placeholder. The operator must extract
  // the upstream frame via the segment-review UI before this segment
  // can render. We surface a precise error mentioning the source
  // segment so the operator does not have to dig through logs.
  const pendingFrames = deps.findPendingExtractedFrames
    ? await deps.findPendingExtractedFrames(segment.id)
    : [];
  if (pendingFrames.length > 0) {
    await deps.updateSegmentStatus(segment.id, "awaiting_upstream_frame");
    const summary = pendingFrames
      .map((frame) => {
        const at =
          typeof frame.sourceTimestampSeconds === "number"
            ? ` at ${frame.sourceTimestampSeconds.toFixed(2)}s`
            : "";
        const source = frame.sourceSegmentId
          ? `segment ${frame.sourceSegmentId}${at}`
          : "an upstream segment";
        return `${frame.canonicalName} (extract from ${source})`;
      })
      .join(", ");
    throw new Error(
      `Segment ${segment.id} is awaiting ${pendingFrames.length} upstream frame${pendingFrames.length === 1 ? "" : "s"}: ${summary}. Open the segment review for the source segment, scrub to the right timestamp, and click "Extract this frame as reference".`,
    );
  }

  // Resolve the references EVERY call: signed URLs are short-lived (15 min)
  // and the user explicitly asked that retries hours later not fail on an
  // expired URL. We never cache the resolved uris anywhere.
  let referenceInputs: SegmentSeedanceReferenceInput[];
  try {
    referenceInputs = await deps.resolveSegmentSeedanceReferences(segment.id);
    assertSegmentReferencesReady(segment, referenceInputs);
    assertReferencesUnderRunwaySizeLimit(segment, referenceInputs);
    assertSeedance2DurationValid(segment);
  } catch (referenceError) {
    await deps.updateSegmentStatus(segment.id, "blocked");
    throw referenceError;
  }

  await deps.updateSegmentStatus(segment.id, "queued");

  try {
    const generationInput = buildSeedanceGenerationInput(segment, referenceInputs);
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
      runwayTaskStatus: "PENDING",
      runwayProgress: null,
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
      operation: RUNWAY_SEGMENT_GENERATION_STARTED,
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
        nextPollDelaySeconds: 6,
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: true,
      },
    });

    return { generationId: generation.id, runwayTaskId: runwayTask.id };
  } catch (error) {
    await deps.updateSegmentStatus(
      segment.id,
      segmentStatusAfterFailedGeneration(segment),
    );
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
    await deps.updateSegmentStatus(
      segment.id,
      segmentStatusAfterFailedGeneration(segment),
    );
    throw new Error("Generation is missing a Runway task ID.");
  }

  if (generation.status === "queued" || generation.status === "pending") {
    await deps.updateGenerationStatus({
      generationId: generation.id,
      status: "processing",
    });
  }

  const task = await deps.getRunwayTask(taskId);
  const runwayProgress = normalizeRunwayProgress(task.progress, task.status);
  await deps.updateGenerationStatus({
    generationId: generation.id,
    status: task.generationStatus,
    runwayTaskStatus: task.status,
    runwayProgress,
    completedAt: task.isTerminal ? deps.now() : undefined,
    modelParams:
      task.status === "FAILED" || task.status === "CANCELLED"
        ? mergeRunwayFailureIntoModelParams(generation.modelParams, task)
        : undefined,
  });

  if (task.status === "SUCCEEDED") {
    const outputUrl = task.output?.[0];
    if (!outputUrl) {
      await deps.updateGenerationStatus({
        generationId: generation.id,
        status: "failed",
        completedAt: deps.now(),
      });
      await deps.updateSegmentStatus(
      segment.id,
      segmentStatusAfterFailedGeneration(segment),
    );
      throw new Error("Succeeded Runway task did not include an output URL.");
    }

    // Audit-only row: billable credits stay on the `started` log (one charge per task).
    if (deps.logCost) {
      await deps.logCost({
        videoId: segment.videoId,
        segmentId: segment.id,
        provider: "runway",
        model: generation.model,
        operation: "seedance_segment_generation_succeeded",
        creditsUsed: null,
        metadata: {
          generationId: generation.id,
          runwayTaskId: taskId,
          billedOnOperation: RUNWAY_SEGMENT_GENERATION_STARTED,
          estimated: true,
          estimatedCredits: generation.costCredits ?? null,
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
    await deps.updateSegmentStatus(
      segment.id,
      segmentStatusAfterFailedGeneration(segment),
    );
    if (deps.logCost && (generation.costCredits ?? 0) > 0) {
      await refundRunwaySegmentGenerationCost(deps.logCost, {
        videoId: segment.videoId,
        segmentId: segment.id,
        generationId: generation.id,
        runwayTaskId: taskId,
        model: generation.model,
        creditsToRefund: generation.costCredits ?? 0,
        runwayTaskStatus: task.status,
        createdBy: data.requestedByUserId,
      });
    }
    return { terminal: true, status: task.status };
  }

  await deps.sendEvent({
    name: "segment.generation.poll.requested",
    data: {
      generationId: generation.id,
      taskId,
      nextPollDelaySeconds: computeNextPollDelaySeconds(task),
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
    await deps.updateSegmentStatus(
      segment.id,
      segmentStatusAfterFailedGeneration(segment),
    );
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

/**
 * Maps the JIT-resolved Seedance reference inputs into the Runway request shape.
 *
 * Seedance 2 exposes both "image references" (`references[]`, up to 9) and
 * "video references" (`referenceVideos[]`, up to 3, combined <= 15s)
 * exclusively on the `text_to_video` endpoint. The `image_to_video`
 * endpoint expects `promptImage` to be a single source frame or a
 * `[first, last]` keyframe pair, and rejects both `references[]` and
 * `referenceVideos[]`. Recipe2Video pipes 1..9 character/state/style
 * image references per segment, plus optionally one outro video reference
 * (`@LicornOutroVideo`), so the orchestrator always targets
 * `text_to_video` and splits the resolved inputs by kind.
 *
 * Reference order is preserved (sorted by `position`) because the Seedance
 * prompt template addresses them positionally (`@KitchenIslandDefault` first,
 * then state and pose references).
 *
 * Source: https://docs.dev.runwayml.com/guides/seedance/
 */
export function buildSeedanceGenerationInput(
  segment: SeedanceSegment,
  referenceInputs: SegmentSeedanceReferenceInput[],
): SeedanceGenerationInput {
  const sorted = [...referenceInputs].sort((a, b) => a.position - b.position);
  const imageRefs = sorted.filter((reference) => (reference.kind ?? "image") === "image");
  const videoRefs = sorted.filter((reference) => reference.kind === "video");

  return {
    promptText: segment.prompt,
    durationSeconds: segment.durationTarget,
    ratio: RUNWAY_DEFAULT_VIDEO_RATIO,
    references:
      imageRefs.length > 0
        ? imageRefs.map<RunwaySeedanceReference>((reference) => ({
            type: "image",
            uri: reference.uri,
          }))
        : undefined,
    referenceVideos:
      videoRefs.length > 0
        ? videoRefs.map<RunwaySeedanceVideoReference>((reference) => ({
            type: "video",
            uri: reference.uri,
            durationSeconds:
              typeof reference.durationSeconds === "number"
                ? reference.durationSeconds
                : undefined,
          }))
        : undefined,
  };
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
 * and the PRD: every Seedance segment needs at least one resolved reference,
 * kitchen anchors are mandatory (`@KitchenLayoutContextWide` as structural
 * context + one shot-specific kitchen view such as `@KitchenIslandDefault`,
 * `@KitchenIslandOverhead`, `@InductionWide`, etc.), and the Seedance
 * 9-reference cap must hold.
 *
 * The check now operates on the JIT-resolved inputs: a resolved entry implies
 * the reference's media is uploaded to Supabase Storage and a signed URL has
 * just been minted. We still walk `segment.references[]` to detect rows that
 * the storyboard considers REQUIRED but that the resolver could not resolve
 * (typically because the agent forgot to declare them in reference-plan.json
 * or because the global is not in asset_library yet).
 */
function assertSegmentReferencesReady(
  segment: SeedanceSegment,
  referenceInputs: SegmentSeedanceReferenceInput[],
) {
  // Image and video references have separate Runway caps. The 9-reference
  // limit only applies to `references[]` (images); `referenceVideos[]` has
  // its own 3-entry / 15s combined cap.
  const imageInputs = referenceInputs.filter(
    (input) => (input.kind ?? "image") === "image",
  );
  const videoInputs = referenceInputs.filter((input) => input.kind === "video");

  if (imageInputs.length > MAX_SEEDANCE_REFERENCE_INPUTS) {
    throw new Error(
      `Segment ${segment.id} resolved ${imageInputs.length} Seedance image reference inputs; Seedance supports at most ${MAX_SEEDANCE_REFERENCE_INPUTS} images.`,
    );
  }

  if (videoInputs.length > RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES) {
    throw new Error(
      `Segment ${segment.id} resolved ${videoInputs.length} Seedance video reference inputs; Seedance supports at most ${RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES} videos.`,
    );
  }

  const totalVideoDurationSeconds = videoInputs.reduce(
    (acc, input) =>
      typeof input.durationSeconds === "number"
        ? acc + input.durationSeconds
        : acc,
    0,
  );
  if (
    totalVideoDurationSeconds > RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES_TOTAL_SECONDS
  ) {
    throw new Error(
      `Segment ${segment.id} has video references with combined duration ${totalVideoDurationSeconds.toFixed(2)}s; Seedance caps the total at ${RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES_TOTAL_SECONDS}s.`,
    );
  }

  if (referenceInputs.length === 0) {
    throw new Error(
      `Segment ${segment.id} has no resolved Seedance references. Sync the agent's reference-plan.json or upload the missing assets to the library before generation.`,
    );
  }

  // The resolver returns the asset_library.canonical_name (e.g. `island_default`)
  // while `segments.references[].name` typically holds the alias the agent
  // wrote (e.g. `KitchenIslandDefault`). We therefore aggregate canonicalName
  // PLUS aliases and use a tolerant normalization (case-insensitive, ignores
  // every separator) so an honest mismatch like `Character-sheet` vs
  // `CharacterSheet` does not block a perfectly-wired segment. The linker
  // (findAssetLibraryByCanonicalNames) is already alias-aware; if the
  // validator is stricter than the linker, segments end up "blocked" with a
  // misleading "could not be resolved" error while their data is fine.
  const resolvedNames = buildMatchableNameSet(referenceInputs);
  const missingRequired = segment.references
    .filter((reference) => reference.required !== false)
    .filter(
      (reference) => !resolvedNames.has(normalizeReferenceName(reference.name)),
    );

  if (missingRequired.length > 0) {
    throw new Error(
      `Segment ${segment.id} has required references that could not be resolved against the library or recipe-specific references: ${missingRequired
        .map((reference) => reference.label || reference.name)
        .join(", ")}.`,
    );
  }

  const hasKitchenReference = referenceInputs.some((input) => {
    const aliasHaystack = (input.aliases ?? []).join(" ").toLowerCase();
    const haystack =
      `${input.canonicalName} ${input.role} ${aliasHaystack}`.toLowerCase();
    return (
      haystack.includes("kitchen") ||
      haystack.includes("island") ||
      haystack.includes("induction") ||
      haystack.includes("oven")
    );
  });

  if (!hasKitchenReference) {
    throw new Error(
      `Segment ${segment.id} is missing a global kitchen reference (e.g. @KitchenIslandDefault).`,
    );
  }

  const hasKitchenLayoutContext = referenceInputs.some((input) => {
    const names = [input.canonicalName, ...(input.aliases ?? [])];
    return names.some((name) => {
      const normalized = normalizeReferenceName(name);
      return (
        normalized === normalizeReferenceName("KitchenLayoutContextWide") ||
        normalized === normalizeReferenceName("kitchen_wide") ||
        normalized === normalizeReferenceName("kitchen_layout_context_wide")
      );
    });
  });
  if (!hasKitchenLayoutContext) {
    throw new Error(
      `Segment ${segment.id} is missing the structural kitchen context reference (@KitchenLayoutContextWide / kitchen_wide). Add it to segment references before generation.`,
    );
  }

  const hasShotSpecificKitchenView = referenceInputs.some((input) => {
    const aliasHaystack = (input.aliases ?? []).join(" ").toLowerCase();
    const haystack =
      `${input.canonicalName} ${input.role} ${aliasHaystack}`.toLowerCase();
    const isKitchenLike =
      haystack.includes("kitchen") ||
      haystack.includes("island") ||
      haystack.includes("induction") ||
      haystack.includes("oven");
    if (!isKitchenLike) {
      return false;
    }
    const names = [input.canonicalName, ...(input.aliases ?? [])];
    const isLayoutContext = names.some((name) => {
      const normalized = normalizeReferenceName(name);
      return (
        normalized === normalizeReferenceName("KitchenLayoutContextWide") ||
        normalized === normalizeReferenceName("kitchen_wide") ||
        normalized === normalizeReferenceName("kitchen_layout_context_wide")
      );
    });
    return !isLayoutContext;
  });

  if (!hasShotSpecificKitchenView) {
    throw new Error(
      `Segment ${segment.id} is missing a shot-specific kitchen view reference in addition to @KitchenLayoutContextWide (for example @KitchenIslandDefault, @KitchenIslandOverhead, @InductionWide).`,
    );
  }
}

function getSeedanceReferenceInputCount(input: SeedanceGenerationInput) {
  return (
    (typeof input.promptImage === "string" ? 1 : 0) +
    (input.references?.length ?? 0) +
    (input.referenceVideos?.length ?? 0)
  );
}

/**
 * Pre-flight validation of every resolved reference against Runway's 16 MB
 * per-asset cap. Without this guard, an oversize PNG (typical case: a 4K
 * kitchen rendering at ~17 MB) gets handed to Runway, which fetches the
 * signed URL, weighs the asset, and rejects the entire request with
 * `Asset size exceeds 16.0MB. (path: references[i].uri)`. That error costs
 * us a Runway round-trip and an Inngest retry, and the operator-facing
 * message would have to be reverse-engineered from a JSON `cause`. By
 * checking the `media_assets.file_size_bytes` we already have in memory,
 * we can refuse the segment with a precise, actionable message that names
 * the offending reference and the size it must reach.
 *
 * `fileSizeBytes` is optional on the input type so legacy/test inputs that
 * don't surface it pass through; production callers always populate it
 * via `resolveSegmentSeedanceReferences`.
 */
function assertReferencesUnderRunwaySizeLimit(
  segment: SeedanceSegment,
  referenceInputs: SegmentSeedanceReferenceInput[],
) {
  const oversize = referenceInputs.filter(
    (input) =>
      typeof input.fileSizeBytes === "number" &&
      input.fileSizeBytes > RUNWAY_MAX_REFERENCE_BYTES,
  );

  if (oversize.length === 0) {
    return;
  }

  const limitMb = (RUNWAY_MAX_REFERENCE_BYTES / (1024 * 1024)).toFixed(1);
  const details = oversize
    .map((input) => {
      const sizeMb = ((input.fileSizeBytes ?? 0) / (1024 * 1024)).toFixed(2);
      const mime = input.mimeType ? ` ${input.mimeType}` : "";
      return `${input.canonicalName} (${sizeMb}MB${mime})`;
    })
    .join(", ");

  throw new Error(
    `Segment ${segment.id} has reference(s) above Runway's ${limitMb}MB-per-asset limit: ${details}. Re-encode/downscale these assets (e.g. via \`npm run normalize:asset-library\`) before regenerating.`,
  );
}

/**
 * Pre-flight validation of `segment.durationTarget` against Seedance 2's
 * 5-15 second integer window (same bounds as `SeedanceSegmentsEnvelopeSchema`).
 * Without this, an out-of-range duration is rejected by
 * Runway as a generic "Validation of body failed" error which is hard to
 * diagnose in the UI; surfacing the exact constraint here lets the operator
 * fix the storyboard before triggering Inngest.
 */
function assertSeedance2DurationValid(segment: SeedanceSegment) {
  const duration = segment.durationTarget;
  const isInteger = Number.isInteger(duration);
  const inRange =
    duration >= RUNWAY_SEEDANCE2_MIN_DURATION_SECONDS &&
    duration <= RUNWAY_SEEDANCE2_MAX_DURATION_SECONDS;

  if (!isInteger || !inRange) {
    throw new Error(
      `Segment ${segment.id} has duration_target=${duration}s, but Seedance 2 only accepts integer durations between ${RUNWAY_SEEDANCE2_MIN_DURATION_SECONDS}s and ${RUNWAY_SEEDANCE2_MAX_DURATION_SECONDS}s. Adjust the storyboard before regenerating.`,
    );
  }
}

function estimateSeedanceCredits(durationSeconds: number) {
  return Math.ceil(durationSeconds * RUNWAY_SEEDANCE2_CREDITS_PER_SECOND);
}

function mergeRunwayFailureIntoModelParams(
  modelParams: Record<string, unknown>,
  task: RunwayTaskStatus,
): Record<string, unknown> {
  if (!task.failure && !task.failureCode) {
    return modelParams;
  }

  return {
    ...modelParams,
    ...(task.failure ? { runwayFailure: task.failure } : {}),
    ...(task.failureCode ? { runwayFailureCode: task.failureCode } : {}),
  };
}

function computeNextPollDelaySeconds(task: RunwayTaskStatus) {
  if (task.status === "THROTTLED") {
    return 25;
  }

  if (task.status === "PENDING") {
    return 15;
  }

  if (task.status === "RUNNING") {
    return 6;
  }

  return 8;
}

export function workflowStatusForRecipeResult(input: {
  clarifyingQuestionCount: number;
}): VideoStatus {
  return input.clarifyingQuestionCount > 0
    ? "clarification_needed"
    : "recipe_ingested";
}
