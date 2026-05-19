import assert from "node:assert/strict";
import test from "node:test";

import { buildMediaStoragePath } from "./storage-paths";
import {
  getReferenceIdFromReferenceImageStoragePath,
  referenceIdFromMediaAsset,
} from "./reference-image-storage";

test("buildMediaStoragePath uses a unique folder per reference image variant", () => {
  const path = buildMediaStoragePath({
    type: "reference_image",
    videoId: "video-1",
    referenceId: "ref-1",
    variantId: "variant-abc",
    mimeType: "image/png",
  });

  assert.equal(path, "video-1/ref-1/variant-abc.png");
});

test("buildMediaStoragePath keeps legacy flat reference image paths without variantId", () => {
  const path = buildMediaStoragePath({
    type: "reference_image",
    videoId: "video-1",
    referenceId: "ref-1",
    mimeType: "image/png",
  });

  assert.equal(path, "video-1/ref-1.png");
});

test("getReferenceIdFromReferenceImageStoragePath parses legacy and variant paths", () => {
  assert.equal(
    getReferenceIdFromReferenceImageStoragePath("video-1/ref-1.png", "video-1"),
    "ref-1",
  );
  assert.equal(
    getReferenceIdFromReferenceImageStoragePath(
      "video-1/ref-1/variant-abc.png",
      "video-1",
    ),
    "ref-1",
  );
  assert.equal(
    getReferenceIdFromReferenceImageStoragePath("other/ref-1.png", "video-1"),
    null,
  );
});

test("buildMediaStoragePath places song-cover artifacts under videoId/artifactId/variantId", () => {
  const coverPath = buildMediaStoragePath({
    type: "album_cover_image",
    videoId: "video-1",
    artifactId: "artifact-1",
    variantId: "variant-1",
    mimeType: "image/png",
  });
  assert.equal(coverPath, "video-1/artifact-1/variant-1.png");

  const canvasPath = buildMediaStoragePath({
    type: "spotify_canvas_video",
    videoId: "video-1",
    artifactId: "artifact-2",
    variantId: "variant-2",
    mimeType: "video/mp4",
  });
  assert.equal(canvasPath, "video-1/artifact-2/variant-2.mp4");
});

test("referenceIdFromMediaAsset prefers metadata.referenceId", () => {
  assert.equal(
    referenceIdFromMediaAsset({
      videoId: "video-1",
      storagePath: "video-1/ignored.png",
      metadata: { referenceId: "ref-from-meta" },
    }),
    "ref-from-meta",
  );
});
