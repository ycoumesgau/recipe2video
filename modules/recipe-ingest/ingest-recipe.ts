import type { CostLogWriter } from "@/modules/costs/cost.types";
import { createGpt55PlanningPromptEngine } from "@/modules/storyboard/services/gpt55-planning-prompt-engine";
import type { RecipeAnalysisInput, RecipeAnalysisResult } from "./recipe.types";

export interface IngestRecipeOptions {
  /**
   * Optional cost log writer so production paths persist OpenAI token usage in
   * `cost_logs`. When omitted, the engine falls back to the noop writer which
   * is appropriate for tests and dev rehearsals only.
   */
  costLogWriter?: CostLogWriter;
}

export async function ingestRecipe(
  input: RecipeAnalysisInput,
  options: IngestRecipeOptions = {},
): Promise<RecipeAnalysisResult> {
  const planningEngine = createGpt55PlanningPromptEngine({
    costLogWriter: options.costLogWriter,
  });

  return planningEngine.analyzeRecipe(input);
}
