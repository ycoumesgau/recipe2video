import assert from "node:assert/strict";
import { test } from "node:test";

import { assertAgentMessageAttachmentFiles } from "../agent-message-attachment-validation";
import { MAX_AGENT_MESSAGE_ATTACHMENTS } from "../media-asset.constants";
import { MAX_RECIPE_SOURCE_FILE_SIZE_BYTES } from "@/modules/videos/video.constants";

test("assertAgentMessageAttachmentFiles rejects too many files", () => {
  const files = Array.from({ length: MAX_AGENT_MESSAGE_ATTACHMENTS + 1 }, (_, i) =>
    new File(["x"], `photo-${i}.jpg`, { type: "image/jpeg" }),
  );

  assert.throws(
    () => assertAgentMessageAttachmentFiles(files),
    /at most/,
  );
});

test("assertAgentMessageAttachmentFiles rejects oversized files", () => {
  const file = new File(
    [new Uint8Array(MAX_RECIPE_SOURCE_FILE_SIZE_BYTES + 1)],
    "big.jpg",
    { type: "image/jpeg" },
  );

  assert.throws(
    () => assertAgentMessageAttachmentFiles([file]),
    /too large/,
  );
});

test("assertAgentMessageAttachmentFiles rejects unsupported mime types", () => {
  const file = new File(["%PDF"], "doc.pdf", { type: "application/pdf" });

  assert.throws(
    () => assertAgentMessageAttachmentFiles([file]),
    /JPG, PNG, or WebP/,
  );
});
