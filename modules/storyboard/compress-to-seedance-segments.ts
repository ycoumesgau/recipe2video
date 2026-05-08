import { createGpt55PlanningPromptEngine } from "@/modules/storyboard/services/gpt55-planning-prompt-engine";
import type { SeedanceSegment, SeedanceSegmentationInput } from "./storyboard.types";

export async function compressToSeedanceSegments(
  input: SeedanceSegmentationInput,
): Promise<SeedanceSegment[]> {
  const planningEngine = createGpt55PlanningPromptEngine();

  return planningEngine.compressToSeedanceSegments(input);
}
