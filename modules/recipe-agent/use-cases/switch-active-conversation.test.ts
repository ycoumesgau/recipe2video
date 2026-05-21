import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConversationBranchForSlug,
  uniqueConversationName,
  uniqueConversationSlug,
} from "./ensure-agent-conversation";

test("buildConversationBranchForSlug keeps legacy branch for initial slug", () => {
  assert.equal(
    buildConversationBranchForSlug("video-1", "initial"),
    "recipe2video/video-1",
  );
});

test("buildConversationBranchForSlug scopes non-initial conversations", () => {
  assert.equal(
    buildConversationBranchForSlug("video-1", "retry-opus"),
    "recipe2video/video-1/retry-opus",
  );
});

test("uniqueConversationSlug deduplicates taken slugs", () => {
  const taken = new Set(["retry-opus"]);
  assert.equal(uniqueConversationSlug("Retry Opus", taken), "retry-opus-2");
});

test("uniqueConversationName deduplicates taken display names", () => {
  const taken = new Set(["Retry with GPT-5.5"]);
  assert.equal(
    uniqueConversationName("Retry with GPT-5.5", taken),
    "Retry with GPT-5.5 (2)",
  );
});
