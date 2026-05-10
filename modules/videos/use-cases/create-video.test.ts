import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecipeAgentMessagePayload,
  type CreateVideoDraftIntent,
} from "./create-video-agent-message";
import type {
  RecipeSourceSummary,
  VideoProductionDefaults,
} from "../video.types";

const productionDefaults: VideoProductionDefaults = {
  targetDurationSeconds: 60,
  stylePreset: "asmr_food",
  videoModel: "seedance2",
  imageModel: "gpt_image_2",
  ttsModel: "eleven_multilingual_v2",
  sfxModel: "eleven_text_to_sound_v2",
};

test("buildRecipeAgentMessagePayload sends recipe ingest requests to the recipe agent", () => {
  const payload = buildRecipeAgentMessagePayload({
    videoId: "video-1",
    profileId: "user-1",
    sourceSummary: {
      type: "text",
      recipeUrl: null,
      pastedTextPreview: "Paris-Brest recipe",
      uploadedFileNames: [],
    },
    pastedRecipeText: "Paris-Brest recipe with praline cream.",
    productionDefaults,
    intent: "analyze",
  });

  assert.equal(payload?.stage, "recipe_ingest");
  assert.equal(payload?.requestedByUserId, "user-1");
  assert.match(payload?.message ?? "", /Paris-Brest recipe with praline cream/);
  assert.match(payload?.message ?? "", /target duration: 60 seconds/);
  assert.match(payload?.message ?? "", /Produce or update recipe-analysis\.json/);
});

test("buildRecipeAgentMessagePayload does not send when saving draft only", () => {
  assert.equal(
    buildRecipeAgentMessagePayload({
      videoId: "video-1",
      profileId: "user-1",
      sourceSummary: textSource(),
      productionDefaults,
      intent: "draft",
    }),
    null,
  );
});

test("buildRecipeAgentMessagePayload does not send for demo fixtures", () => {
  assert.equal(
    buildRecipeAgentMessagePayload({
      videoId: "video-1",
      profileId: "user-1",
      sourceSummary: {
        type: "demo",
        demoRecipeId: "paris-brest",
        recipeUrl: null,
        pastedTextPreview: null,
        uploadedFileNames: [],
      },
      productionDefaults,
      intent: "analyze",
    }),
    null,
  );
});

function textSource(): RecipeSourceSummary {
  return {
    type: "text",
    recipeUrl: null,
    pastedTextPreview: "Recipe text",
    uploadedFileNames: [],
  };
}

const _intent: CreateVideoDraftIntent = "analyze";
void _intent;
