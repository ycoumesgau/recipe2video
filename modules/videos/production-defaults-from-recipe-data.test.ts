import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCursorAgentModelLabel,
  formatCursorAgentReasoningLabel,
  getCursorAgentSelectionDisplay,
  getProductionDefaultsFromRecipeData,
} from "./production-defaults-from-recipe-data";

const baseProductionDefaults = {
  stylePreset: "asmr_food",
  videoModel: "seedance2",
  imageModel: "gpt_image_2",
  ttsModel: "eleven_multilingual_v2",
  sfxModel: "eleven_text_to_sound_v2",
  cursorAgentModel: "gpt-5.5",
  cursorAgentReasoning: "high",
};

test("getProductionDefaultsFromRecipeData parses wizard payload", () => {
  const defaults = getProductionDefaultsFromRecipeData({
    productionDefaults: baseProductionDefaults,
  });

  assert.equal(defaults?.cursorAgentModel, "gpt-5.5");
  assert.equal(defaults?.cursorAgentReasoning, "high");
});

test("getCursorAgentSelectionDisplay formats labels for GPT-5.5", () => {
  const display = getCursorAgentSelectionDisplay({
    productionDefaults: baseProductionDefaults,
  });

  assert.equal(display?.modelLabel, "GPT-5.5");
  assert.equal(display?.reasoningLabel, "High");
});

test("formatCursorAgentReasoningLabel shows not configurable for Composer 2.5", () => {
  assert.equal(
    formatCursorAgentReasoningLabel("composer-2.5"),
    "Not configurable for this model",
  );
});

test("getCursorAgentSelectionDisplay falls back to default model when missing", () => {
  const display = getCursorAgentSelectionDisplay({
    productionDefaults: {
      ...baseProductionDefaults,
      cursorAgentModel: undefined,
    },
  });

  assert.equal(display?.modelLabel, "Composer 2.5");
  assert.equal(
    display?.reasoningLabel,
    "Not configurable for this model",
  );
});

test("formatCursorAgentModelLabel returns raw value for unknown models", () => {
  assert.equal(formatCursorAgentModelLabel("custom-model"), "custom-model");
});
