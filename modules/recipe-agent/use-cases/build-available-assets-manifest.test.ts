import assert from "node:assert/strict";
import test from "node:test";

import { buildAvailableAssetsManifestPath } from "../agent-conversation.utils";

test("buildAvailableAssetsManifestPath scopes manifest under the video workspace", () => {
  assert.equal(
    buildAvailableAssetsManifestPath("video-123"),
    "agent-recipes/video-123/available-assets.json",
  );
});
