import type { CreateCostLogInput } from "@/modules/costs/cost.types";
import type {
  RecipeAgentArtifact,
  RecipeAgentStage,
} from "@/modules/recipe-agent/recipe-agent.types";
import type {
  SegmentGenerationPollRequestedData,
  SegmentGenerationRequestedData,
  SegmentMuxUploadRequestedData,
  SegmentOutputPersistRequestedData,
} from "@/modules/generation/use-cases/orchestrate-segment-generation";
import type {
  ReferenceGenerationCompletedData,
  ReferenceOutputPersistRequestedData,
} from "@/modules/references/use-cases/orchestrate-reference-generation";
import type { ReferenceGenerationPollRequestedData } from "@/modules/references/use-cases/reference-image-poll-workflow";

interface WorkflowAuthEventData {
  requestedByUserId: string;
  /**
   * Legacy flag kept for backward compatibility. The real allowlist check is
   * performed by each Inngest handler against Supabase before invoking the
   * workflow. We never trust this field on the worker side.
   */
  isAllowlisted?: boolean;
}

export const INNGEST_EVENTS = {
  videoRecipeIngestRequested: "video.recipe.ingest.requested",
  videoStoryboardGenerateRequested: "video.storyboard.generate.requested",
  videoReferencesGenerateRequested: "video.references.generate.requested",
  videoReferenceGenerateRequested: "video.reference.generate.requested",
  referenceGenerationPollRequested: "reference.generation.poll.requested",
  referenceOutputPersistRequested: "reference.output.persist.requested",
  referenceGenerationCompleted: "reference.generation.completed",
  segmentGenerationRequested: "segment.generation.requested",
  segmentGenerationPollRequested: "segment.generation.poll.requested",
  segmentOutputPersistRequested: "segment.output.persist.requested",
  segmentMuxUploadRequested: "segment.mux.upload.requested",
  segmentFeedbackApplyRequested: "segment.feedback.apply.requested",
  compositionRenderRequested: "composition.render.requested",
  costLogRequested: "cost.log.requested",
  recipeAgentCreateRequested: "recipe.agent.create.requested",
  recipeAgentMessageRequested: "recipe.agent.message.requested",
  recipeAgentSyncRequested: "recipe.agent.sync.requested",
  songCoverGenerateRequested: "song.cover.generate.requested",
  songCanvasGenerateRequested: "song.canvas.generate.requested",
} as const;

export type InngestEventName =
  (typeof INNGEST_EVENTS)[keyof typeof INNGEST_EVENTS];

export interface RecipeIngestRequestedData extends WorkflowAuthEventData {
  videoId: string;
  sourceType: "url" | "photos" | "text" | "demo_fixture";
  recipeUrl?: string | null;
  recipeText?: string | null;
  photoDescriptions?: string[] | null;
}

export interface StoryboardGenerateRequestedData extends WorkflowAuthEventData {
  videoId: string;
  recipeTitle: string;
  recipeSteps: string[];
  targetDurationSeconds?: number | null;
}

export interface ReferencesGenerateRequestedData extends WorkflowAuthEventData {
  videoId: string;
  /**
   * When true, the workflow generates EVERY recipe-specific reference for
   * the video that still needs an image (status `planned`/`failed` with a
   * prompt). When false or omitted, it preserves the legacy behavior of the
   * "Mark references ready" button: generate planned references, then flip
   * the project to `references_ready`.
   *
   * We split these two intents at the event level so the operator-facing
   * "Generate all missing references" button on the references page does
   * NOT also flip project status as a side effect. References generation
   * and storyboard sign-off must stay independent (the user wants to be
   * able to approve the storyboard without committing credits, and to
   * (re)generate anchors without re-flipping the project status).
   */
  generateAllMissing?: boolean;
  /**
   * When true (legacy "Mark references ready" path), the workflow flips
   * the video project to `references_ready` once every planned reference
   * has been generated. The "Generate all missing references" button keeps
   * this false so the project status reflects an independent user choice.
   */
  flipStatusOnCompletion?: boolean;
}

export interface SingleReferenceGenerateRequestedData
  extends WorkflowAuthEventData {
  videoId: string;
  referenceId: string;
}

export interface FeedbackApplyRequestedData extends WorkflowAuthEventData {
  segmentId: string;
  generationId: string;
}

export interface RecipeAgentCreateRequestedData extends WorkflowAuthEventData {
  videoId: string;
}

export interface RecipeAgentMessageRequestedData extends WorkflowAuthEventData {
  videoId: string;
  stage: RecipeAgentStage;
  message: string;
}

export interface RecipeAgentSyncRequestedData extends WorkflowAuthEventData {
  videoId: string;
  artifacts: RecipeAgentArtifact[];
}

export interface CompositionRenderRequestedData extends WorkflowAuthEventData {
  videoId: string;
  compositionId: string;
}

export type CostLogRequestedData = WorkflowAuthEventData & CreateCostLogInput;

/**
 * Album cover generation request. The Inngest function reads the
 * `song_cover_artifacts` row (kind=album_cover) for `videoId`, resolves
 * the conditioning anchors against `asset_library` + per-video
 * `reference_assets`, kicks off a GPT-Image 2 task on Runway (with
 * 2880:2880 -> 2048:2048 ratio fallback), polls until terminal, and
 * persists the resulting image to the `album-covers` bucket as a new
 * variant. Existing variants stay intact; the new variant becomes the
 * active one.
 */
export interface SongCoverGenerateRequestedData extends WorkflowAuthEventData {
  videoId: string;
}

/**
 * Spotify Canvas generation request. Same shape as the album cover
 * event — the Inngest function reads the `song_cover_artifacts` row
 * (kind=spotify_canvas) and drives a Seedance 2 text_to_video task at
 * 1080:1920 for `duration_seconds` seconds with the planned image and
 * video references. Result is persisted to the `spotify-canvases`
 * bucket.
 */
export interface SongCanvasGenerateRequestedData extends WorkflowAuthEventData {
  videoId: string;
}

export type Recipe2VideoEventPayloads = {
  [INNGEST_EVENTS.videoRecipeIngestRequested]: RecipeIngestRequestedData;
  [INNGEST_EVENTS.videoStoryboardGenerateRequested]: StoryboardGenerateRequestedData;
  [INNGEST_EVENTS.videoReferencesGenerateRequested]: ReferencesGenerateRequestedData;
  [INNGEST_EVENTS.videoReferenceGenerateRequested]: SingleReferenceGenerateRequestedData;
  [INNGEST_EVENTS.referenceGenerationPollRequested]: ReferenceGenerationPollRequestedData;
  [INNGEST_EVENTS.referenceOutputPersistRequested]: ReferenceOutputPersistRequestedData;
  [INNGEST_EVENTS.referenceGenerationCompleted]: ReferenceGenerationCompletedData;
  [INNGEST_EVENTS.segmentGenerationRequested]: SegmentGenerationRequestedData;
  [INNGEST_EVENTS.segmentGenerationPollRequested]: SegmentGenerationPollRequestedData;
  [INNGEST_EVENTS.segmentOutputPersistRequested]: SegmentOutputPersistRequestedData;
  [INNGEST_EVENTS.segmentMuxUploadRequested]: SegmentMuxUploadRequestedData;
  [INNGEST_EVENTS.segmentFeedbackApplyRequested]: FeedbackApplyRequestedData;
  [INNGEST_EVENTS.compositionRenderRequested]: CompositionRenderRequestedData;
  [INNGEST_EVENTS.costLogRequested]: CostLogRequestedData;
  [INNGEST_EVENTS.recipeAgentCreateRequested]: RecipeAgentCreateRequestedData;
  [INNGEST_EVENTS.recipeAgentMessageRequested]: RecipeAgentMessageRequestedData;
  [INNGEST_EVENTS.recipeAgentSyncRequested]: RecipeAgentSyncRequestedData;
  [INNGEST_EVENTS.songCoverGenerateRequested]: SongCoverGenerateRequestedData;
  [INNGEST_EVENTS.songCanvasGenerateRequested]: SongCanvasGenerateRequestedData;
};
