import assert from "node:assert/strict";
import test from "node:test";

import { getRecipeSourceSummaryFromRecipeData } from "./recipe-source-from-recipe-data";

test("getRecipeSourceSummaryFromRecipeData returns photos summary when source type is photos", () => {
  const summary = getRecipeSourceSummaryFromRecipeData({
    source: {
      type: "photos",
      recipeUrl: null,
      pastedTextPreview: null,
      demoRecipeId: null,
      uploadedFileNames: ["a.jpg"],
    },
    productionDefaults: {},
  });

  assert.equal(summary?.type, "photos");
  assert.deepEqual(summary?.uploadedFileNames, ["a.jpg"]);
});

test("getRecipeSourceSummaryFromRecipeData returns null when source type invalid", () => {
  assert.equal(
    getRecipeSourceSummaryFromRecipeData({
      source: { type: "bogus" },
    }),
    null,
  );
});
