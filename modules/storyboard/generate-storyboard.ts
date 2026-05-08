import { createGpt55PlanningPromptEngine } from "@/modules/storyboard/services/gpt55-planning-prompt-engine";
import type { LogicalScene, StoryboardGenerationInput } from "./storyboard.types";

export async function generateStoryboard(input: StoryboardGenerationInput): Promise<LogicalScene[]> {
  const planningEngine = createGpt55PlanningPromptEngine();

  return planningEngine.generateLogicalScenes(input);
}
