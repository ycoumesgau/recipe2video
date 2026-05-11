import assert from "node:assert/strict";
import test from "node:test";

import { buildRecipeAgentUserChatContent } from "./seed-recipe-agent-chat-turn";

test("buildRecipeAgentUserChatContent appends note when images attached", () => {
  const text = buildRecipeAgentUserChatContent("Hello", 2);
  assert.match(text, /^Hello\n\n\(/);
  assert.match(text, /2 recipe source image/);
});

test("buildRecipeAgentUserChatContent leaves message unchanged when no images", () => {
  assert.equal(buildRecipeAgentUserChatContent("Hello", 0), "Hello");
});
