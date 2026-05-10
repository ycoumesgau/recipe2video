import assert from "node:assert/strict";
import test from "node:test";

import { extractAssistantCheckpoint } from "./checkpoint-parse";

test("extractAssistantCheckpoint parses machine JSON block", () => {
  const parsed = extractAssistantCheckpoint(
    'Done\n```json\n{"recipe2videoCheckpoint":{"branch":"recipe2video/video-1","commitSha":"abc1234567","manifestPath":"agent-recipes/video-1/checkpoint-manifest.json"}}\n```',
  );

  assert.deepEqual(parsed, {
    recipe2videoCheckpoint: {
      branch: "recipe2video/video-1",
      commitSha: "abc1234567",
      manifestPath: "agent-recipes/video-1/checkpoint-manifest.json",
    },
  });
});

test("extractAssistantCheckpoint parses fallback text with pushed SHA", () => {
  const parsed = extractAssistantCheckpoint(
    "Le SHA poussé est `922e0d36aae2dbde55745c225339d49376d71cd2`. checkpoint-manifest.json est dans agent-recipes/video-2/checkpoint-manifest.json",
  );

  assert.deepEqual(parsed, {
    recipe2videoCheckpoint: {
      commitSha: "922e0d36aae2dbde55745c225339d49376d71cd2",
      manifestPath: "agent-recipes/video-2/checkpoint-manifest.json",
    },
  });
});

test("extractAssistantCheckpoint returns null when checkpoint is absent", () => {
  const parsed = extractAssistantCheckpoint("Aucun checkpoint ici.");

  assert.equal(parsed, null);
});
