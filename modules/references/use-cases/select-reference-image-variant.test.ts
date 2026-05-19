import assert from "node:assert/strict";
import test from "node:test";

import { referenceIdFromMediaAsset } from "@/modules/media-assets/reference-image-storage";

test("referenceIdFromMediaAsset resolves variant storage paths for selection guards", () => {
  const referenceId = "4c1053b6-ecfd-4af3-89f2-f866aa2a295b";
  const videoId = "video-abc";

  assert.equal(
    referenceIdFromMediaAsset({
      videoId,
      storagePath: `${videoId}/${referenceId}/new-variant.png`,
      metadata: { referenceId },
    }),
    referenceId,
  );
});
