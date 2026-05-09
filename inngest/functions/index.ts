import {
  generateStoryboardWorkflow,
  ingestRecipeWorkflow,
  logCostWorkflow,
} from "./planning-stubs";
import {
  persistSegmentOutput,
  pollSegmentGeneration,
  requestSegmentGeneration,
  uploadSegmentMux,
} from "./segment-generation";

export const functions = [
  ingestRecipeWorkflow,
  generateStoryboardWorkflow,
  requestSegmentGeneration,
  pollSegmentGeneration,
  persistSegmentOutput,
  uploadSegmentMux,
  logCostWorkflow,
];
