import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNWAY_GPT_IMAGE_2_CREDITS_1K_2K_HIGH,
  RUNWAY_GPT_IMAGE_2_CREDITS_4K_HIGH,
  RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
  estimateGptImage2Credits,
} from "./runway.constants";

test("estimateGptImage2Credits bills recipe references at the 2K high tier", () => {
  assert.equal(
    estimateGptImage2Credits(RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO),
    RUNWAY_GPT_IMAGE_2_CREDITS_1K_2K_HIGH,
  );
});

test("estimateGptImage2Credits bills square album cover ratios by long edge", () => {
  assert.equal(estimateGptImage2Credits("2880:2880"), RUNWAY_GPT_IMAGE_2_CREDITS_4K_HIGH);
  assert.equal(estimateGptImage2Credits("2048:2048"), RUNWAY_GPT_IMAGE_2_CREDITS_1K_2K_HIGH);
});

test("estimateGptImage2Credits treats auto as the 4K tier", () => {
  assert.equal(estimateGptImage2Credits("auto"), RUNWAY_GPT_IMAGE_2_CREDITS_4K_HIGH);
});
