import type { RecipeAgentMessageRequestedData } from "@/inngest/events";

import type {
  RecipeSourceSummary,
  VideoProductionDefaults,
} from "../video.types";

export type CreateVideoDraftIntent = "analyze" | "draft";

export interface BuildRecipeAgentMessagePayloadInput {
  videoId: string;
  profileId: string;
  sourceSummary: RecipeSourceSummary;
  productionDefaults: VideoProductionDefaults;
  intent: CreateVideoDraftIntent;
  pastedRecipeText?: string;
}

export function buildRecipeAgentMessagePayload(
  input: BuildRecipeAgentMessagePayloadInput,
): RecipeAgentMessageRequestedData | null {
  if (input.intent === "draft" || input.sourceSummary.type === "demo") {
    return null;
  }

  return {
    videoId: input.videoId,
    stage: "recipe_ingest",
    message: buildInitialRecipeAgentMessage(input),
    requestedByUserId: input.profileId,
    isAllowlisted: true,
  };
}

function buildInitialRecipeAgentMessage(
  input: BuildRecipeAgentMessagePayloadInput,
) {
  return [
    "Create or update the required Recipe2Video planning artifacts for this new recipe project.",
    "",
    `Video ID: ${input.videoId}`,
    `Recipe source type: ${input.sourceSummary.type}`,
    input.sourceSummary.recipeUrl
      ? `Recipe URL: ${input.sourceSummary.recipeUrl}`
      : null,
    input.pastedRecipeText
      ? `Pasted recipe text:\n${input.pastedRecipeText}`
      : input.sourceSummary.pastedTextPreview
        ? `Pasted text preview:\n${input.sourceSummary.pastedTextPreview}`
        : null,
    input.sourceSummary.uploadedFileNames?.length
      ? `Uploaded recipe/source files:\n${input.sourceSummary.uploadedFileNames.map((name) => `- ${name}`).join("\n")}`
      : null,
    "",
    "Production defaults:",
    `- target duration: ${input.productionDefaults.targetDurationSeconds} seconds`,
    `- style preset: ${input.productionDefaults.stylePreset}`,
    `- video model: ${input.productionDefaults.videoModel}`,
    `- image model for reference generation: ${input.productionDefaults.imageModel}`,
    `- TTS model: ${input.productionDefaults.ttsModel}`,
    `- SFX model: ${input.productionDefaults.sfxModel}`,
    "",
    "Produce or update recipe-analysis.json first. If enough information is available, also produce logical-scenes.json, seedance-segments.json, reference-plan.json, suno-prompt.md, decisions.md, and changelog.md.",
    "Do not launch Runway, Suno, Supabase, Mux, Remotion, or any paid generation. Recipe2Video will validate and execute later.",
  ]
    .filter(Boolean)
    .join("\n");
}
