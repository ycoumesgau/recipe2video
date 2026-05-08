import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpenAiPlanningClient,
  parseJsonObject,
  resolveOpenAiPlanningConfig,
} from "./openai-planning-client";

test("resolveOpenAiPlanningConfig requires a server API key", () => {
  assert.throws(
    () =>
      resolveOpenAiPlanningConfig({
        OPENAI_PLANNING_MODEL: "gpt-5.5-high",
      }),
    /OPENAI_API_KEY/,
  );
});

test("resolveOpenAiPlanningConfig requires an explicit model id", () => {
  assert.throws(
    () =>
      resolveOpenAiPlanningConfig({
        OPENAI_API_KEY: "sk-test",
      }),
    /OPENAI_PLANNING_MODEL/,
  );
});

test("parseJsonObject rejects non-object JSON", () => {
  assert.throws(() => parseJsonObject("[1,2,3]", "test_operation"), /JSON object/);
});

test("createOpenAiPlanningClient returns parsed JSON and real usage", async () => {
  const client = createOpenAiPlanningClient({
    apiKey: "sk-test",
    model: "gpt-5.5-high",
    responsesCreate: async () => ({
      output_text: "{\"ok\":true}",
      usage: {
        input_tokens: 12,
        output_tokens: 5,
      },
    }),
  });

  const result = await client.generateJson<{ ok: boolean }>({
    operation: "test_operation",
    prompt: "Return JSON.",
  });

  assert.deepEqual(result.json, { ok: true });
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 5 });
});
