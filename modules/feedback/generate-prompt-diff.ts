import type { PromptEditInput, PromptEditResult } from "@/modules/feedback/feedback.types";
import type { CostLogWriter } from "@/modules/costs/cost.types";
import { createGpt55PlanningPromptEngine } from "@/modules/storyboard/services/gpt55-planning-prompt-engine";

interface GeneratePromptDiffOptions {
  costLogWriter?: CostLogWriter;
  mode?: "live" | "stub";
}

export async function generatePromptDiff(
  input: PromptEditInput,
  options: GeneratePromptDiffOptions = {},
): Promise<PromptEditResult> {
  const planningEngine = createGpt55PlanningPromptEngine({
    costLogWriter: options.costLogWriter,
    mode: options.mode ?? "live",
  });

  return planningEngine.editPromptFromFeedback(input);
}
