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

const productionDefaultsWithDuration: VideoProductionDefaults = {
  targetDurationSeconds: 60,
  stylePreset: "asmr_food",
  videoModel: "seedance2",
  imageModel: "gpt_image_2",
  ttsModel: "eleven_multilingual_v2",
  sfxModel: "eleven_text_to_sound_v2",
  cursorAgentModel: "gpt-5.5",
  cursorAgentReasoning: "high",
  cursorAgentFast: "false",
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
    productionDefaults: productionDefaultsWithDuration,
    intent: "analyze",
  });

  assert.equal(payload?.stage, "recipe_ingest");
  assert.equal(payload?.requestedByUserId, "user-1");
  assert.match(payload?.message ?? "", /Paris-Brest recipe with praline cream/);
  assert.match(payload?.message ?? "", /target duration: 60 seconds/);
  assert.match(payload?.message ?? "", /Cursor agent model: gpt-5.5/);
  assert.match(payload?.message ?? "", /Cursor agent reasoning: high/);
  assert.match(payload?.message ?? "", /Cursor agent fast mode: disabled/);
  assert.match(payload?.message ?? "", /produce or update recipe-analysis\.json/i);
});

test("buildRecipeAgentMessagePayload mentions vision attachment for photo sources", () => {
  const payload = buildRecipeAgentMessagePayload({
    videoId: "video-1",
    profileId: "user-1",
    sourceSummary: {
      type: "photos",
      recipeUrl: null,
      pastedTextPreview: null,
      uploadedFileNames: ["dish.jpg"],
      demoRecipeId: null,
    },
    productionDefaults: productionDefaultsWithDuration,
    intent: "analyze",
  });

  assert.match(payload?.message ?? "", /signed image URLs \(vision\)/i);
  assert.match(payload?.message ?? "", /dish\.jpg/);
});

test("buildRecipeAgentMessagePayload does not send when saving draft only", () => {
  assert.equal(
    buildRecipeAgentMessagePayload({
      videoId: "video-1",
      profileId: "user-1",
      sourceSummary: textSource(),
      productionDefaults: productionDefaultsWithDuration,
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
      productionDefaults: productionDefaultsWithDuration,
      intent: "analyze",
    }),
    null,
  );
});

test("buildRecipeAgentMessagePayload omits target duration when set to auto", () => {
  const payload = buildRecipeAgentMessagePayload({
    videoId: "video-1",
    profileId: "user-1",
    sourceSummary: textSource(),
    pastedRecipeText: "Quick noodle bowl.",
    productionDefaults: {
      stylePreset: "asmr_food",
      videoModel: "seedance2",
      imageModel: "gpt_image_2",
      ttsModel: "eleven_multilingual_v2",
      sfxModel: "eleven_text_to_sound_v2",
    },
    intent: "analyze",
  });

  assert.doesNotMatch(payload?.message ?? "", /target duration:/i);
});

test("buildRecipeAgentMessagePayload omits reasoning for models without reasoning levels", () => {
  const payload = buildRecipeAgentMessagePayload({
    videoId: "video-1",
    profileId: "user-1",
    sourceSummary: textSource(),
    productionDefaults: {
      stylePreset: "asmr_food",
      videoModel: "seedance2",
      imageModel: "gpt_image_2",
      ttsModel: "eleven_multilingual_v2",
      sfxModel: "eleven_text_to_sound_v2",
      cursorAgentModel: "composer-2",
      cursorAgentFast: "true",
    },
    intent: "analyze",
  });

  assert.match(payload?.message ?? "", /Cursor agent model: composer-2/i);
  assert.match(payload?.message ?? "", /Cursor agent fast mode: enabled/i);
  assert.doesNotMatch(payload?.message ?? "", /Cursor agent reasoning:/i);
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
