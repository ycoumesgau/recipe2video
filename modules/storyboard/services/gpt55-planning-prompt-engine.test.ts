import assert from "node:assert/strict";
import test from "node:test";

import type { CostLogWriter } from "@/modules/costs/cost.types";
import type { OpenAiPlanningClient } from "./openai-planning-client";
import { createGpt55PlanningPromptEngine } from "./gpt55-planning-prompt-engine";

test("live planning engine uses OpenAI JSON output and logs real token usage", async () => {
  const calls: string[] = [];
  const logs: unknown[] = [];
  const openAiClient: OpenAiPlanningClient = {
    async generateJson(input) {
      calls.push(input.operation);

      return {
        json: {
          recipe: {
            title: "Test recipe",
            sourceType: "text",
            ingredients: [],
            steps: [],
            subRecipes: [],
            assumptions: [],
            timing: null,
            criticalTransformations: [],
            visualTextureOpportunities: [],
            possibleHooks: [],
            promptPolicySources: [],
          },
          clarifyingQuestions: [],
        },
        usage: { inputTokens: 42, outputTokens: 12 },
      };
    },
  };
  const costLogWriter: CostLogWriter = {
    async logOpenAiUsage(input) {
      logs.push(input);
    },
  };

  const engine = createGpt55PlanningPromptEngine({
    mode: "live",
    openAiClient,
    costLogWriter,
  });
  const result = await engine.analyzeRecipe({
    videoId: "video-1",
    sourceType: "text",
    recipeText: "A test recipe.",
    requestedByUserId: "user-1",
    isAllowlisted: true,
  });

  assert.equal(result.recipe.title, "Test recipe");
  assert.deepEqual(calls, ["recipe_analysis"]);
  assert.deepEqual(logs, [
    {
      videoId: "video-1",
      segmentId: null,
      model: "GPT-5.5 High",
      operation: "recipe_analysis",
      costDollars: null,
      tokensInput: 42,
      tokensOutput: 12,
      metadata: { sourceType: "text" },
      createdBy: "user-1",
    },
  ]);
});
