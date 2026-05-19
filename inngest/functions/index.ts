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
import {
  generateReferencesWorkflow,
  generateSingleReferenceWorkflow,
  persistReferenceOutput,
  pollReferenceGeneration,
} from "./references-generation";
import { renderCompositionExport } from "./composition-render";
import {
  applySegmentFeedbackRegeneration,
  persistSegmentOutput,
  pollSegmentGeneration,
  requestSegmentGeneration,
  uploadSegmentMux,
} from "./segment-generation";
import { generateAlbumCoverWorkflow } from "./song-cover-generation";
import { generateSpotifyCanvasWorkflow } from "./song-canvas-generation";

export const functions = [
  ingestRecipeWorkflow,
  generateStoryboardWorkflow,
  generateReferencesWorkflow,
  generateSingleReferenceWorkflow,
  pollReferenceGeneration,
  persistReferenceOutput,
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
  generateAlbumCoverWorkflow,
  generateSpotifyCanvasWorkflow,
];
