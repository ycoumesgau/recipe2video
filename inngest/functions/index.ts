import {
  generateStoryboardWorkflow,
  ingestRecipeWorkflow,
  logCostWorkflow,
} from "./planning-stubs";
import { generateReferencesWorkflow } from "./references-generation";
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
  generateReferencesWorkflow,
  requestSegmentGeneration,
  applySegmentFeedbackRegeneration,
  pollSegmentGeneration,
  persistSegmentOutput,
  uploadSegmentMux,
  logCostWorkflow,
];
