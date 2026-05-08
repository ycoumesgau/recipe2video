import { createGpt55PlanningPromptEngine } from "@/modules/storyboard/services/gpt55-planning-prompt-engine";
import type { RecipeAnalysisInput, RecipeAnalysisResult } from "./recipe.types";

export async function ingestRecipe(input: RecipeAnalysisInput): Promise<RecipeAnalysisResult> {
  const planningEngine = createGpt55PlanningPromptEngine();

  return planningEngine.analyzeRecipe(input);
}
