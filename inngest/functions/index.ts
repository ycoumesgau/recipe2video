import {
  generateStoryboardWorkflow,
  ingestRecipeWorkflow,
  logCostWorkflow,
} from "./planning-stubs";
import {
  applySegmentFeedbackRegeneration,
  persistSegmentOutput,
  pollSegmentGeneration,
  requestSegmentGeneration,
  uploadSegmentMux,
} from "./segment-generation";

export const functions = [
  ingestRecipeWorkflow,
  generateStoryboardWorkflow,
  requestSegmentGeneration,
  applySegmentFeedbackRegeneration,
  pollSegmentGeneration,
  persistSegmentOutput,
  uploadSegmentMux,
  logCostWorkflow,
];
