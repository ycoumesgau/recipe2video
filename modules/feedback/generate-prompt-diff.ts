import type { PromptEditInput, PromptEditResult } from "@/modules/feedback/feedback.types";
import { createGpt55PlanningPromptEngine } from "@/modules/storyboard/services/gpt55-planning-prompt-engine";

export async function generatePromptDiff(input: PromptEditInput): Promise<PromptEditResult> {
  const planningEngine = createGpt55PlanningPromptEngine();

  return planningEngine.editPromptFromFeedback(input);
}
