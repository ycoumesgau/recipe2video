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

interface WorkflowAuthEventData {
  requestedByUserId: string;
  /**
   * Legacy flag kept for backward compatibility. The real allowlist check is
   * performed by each Inngest handler against Supabase before invoking the
   * workflow. We never trust this field on the worker side.
   */
  isAllowlisted?: boolean;
}

// `composition.render.requested` was declared but never handled. Server-side
// Remotion rendering is a post-hackathon item (see `docs/demo-runbook.md`
// "Phase 5 follow-ups"). The current export path stores a user-uploaded MP4
// directly through `uploadFinalExportAction`. Re-add the event when a real
// render worker (Vercel Sandbox or @remotion/renderer) is wired.
export const INNGEST_EVENTS = {
  videoRecipeIngestRequested: "video.recipe.ingest.requested",
  videoStoryboardGenerateRequested: "video.storyboard.generate.requested",
  videoReferencesGenerateRequested: "video.references.generate.requested",
  segmentGenerationRequested: "segment.generation.requested",
  segmentGenerationPollRequested: "segment.generation.poll.requested",
  segmentOutputPersistRequested: "segment.output.persist.requested",
  segmentMuxUploadRequested: "segment.mux.upload.requested",
  segmentFeedbackApplyRequested: "segment.feedback.apply.requested",
  costLogRequested: "cost.log.requested",
  recipeAgentCreateRequested: "recipe.agent.create.requested",
  recipeAgentMessageRequested: "recipe.agent.message.requested",
  recipeAgentSyncRequested: "recipe.agent.sync.requested",
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

export type CostLogRequestedData = WorkflowAuthEventData & CreateCostLogInput;

export type Recipe2VideoEventPayloads = {
  [INNGEST_EVENTS.videoRecipeIngestRequested]: RecipeIngestRequestedData;
  [INNGEST_EVENTS.videoStoryboardGenerateRequested]: StoryboardGenerateRequestedData;
  [INNGEST_EVENTS.videoReferencesGenerateRequested]: ReferencesGenerateRequestedData;
  [INNGEST_EVENTS.segmentGenerationRequested]: SegmentGenerationRequestedData;
  [INNGEST_EVENTS.segmentGenerationPollRequested]: SegmentGenerationPollRequestedData;
  [INNGEST_EVENTS.segmentOutputPersistRequested]: SegmentOutputPersistRequestedData;
  [INNGEST_EVENTS.segmentMuxUploadRequested]: SegmentMuxUploadRequestedData;
  [INNGEST_EVENTS.segmentFeedbackApplyRequested]: FeedbackApplyRequestedData;
  [INNGEST_EVENTS.costLogRequested]: CostLogRequestedData;
  [INNGEST_EVENTS.recipeAgentCreateRequested]: RecipeAgentCreateRequestedData;
  [INNGEST_EVENTS.recipeAgentMessageRequested]: RecipeAgentMessageRequestedData;
  [INNGEST_EVENTS.recipeAgentSyncRequested]: RecipeAgentSyncRequestedData;
};
