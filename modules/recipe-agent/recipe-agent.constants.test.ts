import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RECIPE_AGENT_CURSOR_RUN_MAX_DURATION_MS,
  resolveRecipeAgentRunMaxDurationMs,
} from "./recipe-agent.constants";

test("resolveRecipeAgentRunMaxDurationMs uses 30 minutes for Cursor SDK stages", () => {
  assert.equal(
    resolveRecipeAgentRunMaxDurationMs("general"),
    RECIPE_AGENT_CURSOR_RUN_MAX_DURATION_MS,
  );
  assert.equal(
    resolveRecipeAgentRunMaxDurationMs("publication_planning"),
    RECIPE_AGENT_CURSOR_RUN_MAX_DURATION_MS,
  );
  assert.equal(
    resolveRecipeAgentRunMaxDurationMs("recipe_ingest"),
    RECIPE_AGENT_CURSOR_RUN_MAX_DURATION_MS,
  );
  assert.equal(RECIPE_AGENT_CURSOR_RUN_MAX_DURATION_MS, 30 * 60 * 1000);
});
