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
