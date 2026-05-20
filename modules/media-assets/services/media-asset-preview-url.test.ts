import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveVideoPosterStoragePath,
  resolveMediaAssetPreviewStoragePath,
} from "./media-asset-preview-url";

test("resolveMediaAssetPreviewStoragePath returns the image path for PNG assets", () => {
  assert.equal(
    resolveMediaAssetPreviewStoragePath({
      mimeType: "image/png",
      storageBucket: "reference-images",
      storagePath: "library/kitchen/island_default.png",
      metadata: null,
    }),
    "library/kitchen/island_default.png",
  );
});

test("resolveMediaAssetPreviewStoragePath prefers explicit poster metadata for videos", () => {
  assert.equal(
    resolveMediaAssetPreviewStoragePath({
      mimeType: "video/mp4",
      storageBucket: "reference-images",
      storagePath: "library/character/outro/LicornOutroVideo.mp4",
      metadata: {
        previewStoragePath: "library/character/outro/custom-poster.jpg",
      },
    }),
    "library/character/outro/custom-poster.jpg",
  );
});

test("deriveVideoPosterStoragePath follows the -poster.jpg convention", () => {
  assert.equal(
    deriveVideoPosterStoragePath("library/character/outro/LicornOutroVideo.mp4"),
    "library/character/outro/LicornOutroVideo-poster.jpg",
  );
});

test("resolveMediaAssetPreviewStoragePath falls back to the poster convention", () => {
  assert.equal(
    resolveMediaAssetPreviewStoragePath({
      mimeType: "video/mp4",
      storageBucket: "reference-images",
      storagePath: "library/character/outro/LicornOutroVideo.mp4",
      metadata: null,
    }),
    "library/character/outro/LicornOutroVideo-poster.jpg",
  );
});
