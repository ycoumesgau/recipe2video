import assert from "node:assert/strict";
import { test } from "node:test";

import type { MediaAsset } from "@/modules/media-assets/media-asset.types";

import { mediaAssetToCursorImage } from "./agent-attachment-cursor-images";

test("mediaAssetToCursorImage includes dimensions when width and height are set", () => {
  const asset = {
    width: 1920,
    height: 1080,
  } as MediaAsset;

  assert.deepEqual(mediaAssetToCursorImage("https://example.com/a.jpg", asset), {
    url: "https://example.com/a.jpg",
    dimension: { width: 1920, height: 1080 },
  });
});

test("mediaAssetToCursorImage omits dimensions when missing", () => {
  const asset = {} as MediaAsset;

  assert.deepEqual(mediaAssetToCursorImage("https://example.com/a.jpg", asset), {
    url: "https://example.com/a.jpg",
  });
});
