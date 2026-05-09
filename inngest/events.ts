import type { CreateCostLogInput } from "@/modules/costs/cost.types";
import type {
  SegmentGenerationPollRequestedData,
  SegmentGenerationRequestedData,
  SegmentMuxUploadRequestedData,
  SegmentOutputPersistRequestedData,
} from "@/modules/generation/use-cases/orchestrate-segment-generation";

interface WorkflowAuthEventData {
  requestedByUserId: string;
  isAllowlisted: boolean;
}

export const INNGEST_EVENTS = {
  videoRecipeIngestRequested: "video.recipe.ingest.requested",
  videoStoryboardGenerateRequested: "video.storyboard.generate.requested",
  videoReferencesGenerateRequested: "video.references.generate.requested",
  segmentGenerationRequested: "segment.generation.requested",
  segmentGenerationPollRequested: "segment.generation.poll.requested",
  segmentOutputPersistRequested: "segment.output.persist.requested",
  segmentMuxUploadRequested: "segment.mux.upload.requested",
  segmentFeedbackApplyRequested: "segment.feedback.apply.requested",
  compositionRenderRequested: "composition.render.requested",
  costLogRequested: "cost.log.requested",
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

export interface CompositionRenderRequestedData extends WorkflowAuthEventData {
  compositionId: string;
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
  [INNGEST_EVENTS.compositionRenderRequested]: CompositionRenderRequestedData;
  [INNGEST_EVENTS.costLogRequested]: CostLogRequestedData;
};
