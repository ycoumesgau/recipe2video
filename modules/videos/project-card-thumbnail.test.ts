import assert from "node:assert/strict";
import test from "node:test";

import {
  isFinalDishVisualCanonicalName,
  pickProjectCardThumbnail,
} from "./project-card-thumbnail";

test("pickProjectCardThumbnail prefers FinalDishVisual over other references", () => {
  const pick = pickProjectCardThumbnail({
    references: [
      {
        canonicalName: "IngredientFlatlay",
        mediaAssetId: "media-ingredient",
        createdAt: "2026-05-01T00:00:00.000Z",
      },
      {
        canonicalName: "FinalDishVisual",
        mediaAssetId: "media-dish",
        createdAt: "2026-05-02T00:00:00.000Z",
      },
    ],
    recipeSourceImageAssetIds: ["media-upload"],
    muxPlaybackId: "mux-playback",
  });

  assert.deepEqual(pick, { kind: "media", mediaAssetId: "media-dish" });
});

test("pickProjectCardThumbnail falls back to another recipe reference", () => {
  const pick = pickProjectCardThumbnail({
    references: [
      {
        canonicalName: "FinalDishVisual",
        mediaAssetId: null,
        createdAt: "2026-05-01T00:00:00.000Z",
      },
      {
        canonicalName: "BatterInBowl",
        mediaAssetId: "media-batter",
        createdAt: "2026-05-02T00:00:00.000Z",
      },
    ],
    recipeSourceImageAssetIds: [],
    muxPlaybackId: null,
  });

  assert.deepEqual(pick, { kind: "media", mediaAssetId: "media-batter" });
});

test("pickProjectCardThumbnail uses recipe source photos before Mux", () => {
  const pick = pickProjectCardThumbnail({
    references: [],
    recipeSourceImageAssetIds: ["media-upload-1", "media-upload-2"],
    muxPlaybackId: "mux-playback",
  });

  assert.deepEqual(pick, { kind: "media", mediaAssetId: "media-upload-1" });
});

test("pickProjectCardThumbnail uses Mux when no recipe imagery exists", () => {
  const pick = pickProjectCardThumbnail({
    references: [],
    recipeSourceImageAssetIds: [],
    muxPlaybackId: "mux-playback",
  });

  assert.deepEqual(pick, { kind: "mux", playbackId: "mux-playback" });
});

test("isFinalDishVisualCanonicalName is case-insensitive", () => {
  assert.equal(isFinalDishVisualCanonicalName("finaldishvisual"), true);
  assert.equal(isFinalDishVisualCanonicalName("OtherRef"), false);
});
