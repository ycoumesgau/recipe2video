import {
  generateStoryboardWorkflow,
  ingestRecipeWorkflow,
  logCostWorkflow,
} from "./planning-stubs";
import {
  createRecipeAgentWorkflow,
  sendRecipeAgentMessageWorkflow,
  syncRecipeAgentArtifactsWorkflow,
} from "./recipe-agent";
import { generateReferencesWorkflow } from "./references-generation";
import { renderCompositionExport } from "./composition-render";
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
  renderCompositionExport,
  logCostWorkflow,
  createRecipeAgentWorkflow,
  sendRecipeAgentMessageWorkflow,
  syncRecipeAgentArtifactsWorkflow,
];
