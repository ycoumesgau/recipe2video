import type { LogicalScene, SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import type { VideoProject } from "@/modules/videos/video.types";

import { parseSunoMarkdownForAssembly } from "./suno-prompt-format";
import { buildSunoPrompt } from "./suno-prompt";
import type { SunoPromptV2 } from "@/modules/recipe-agent/suno-prompt-v2.schema";
import { parseSunoPromptV2FromUnknown } from "@/modules/recipe-agent/suno-prompt-v2.schema";

export type SunoAssemblyPromptView =
  | { source: "v2"; v2: SunoPromptV2 }
  | { source: "markdown"; parsed: ReturnType<typeof parseSunoMarkdownForAssembly> }
  | { source: "fallback"; prompt: string };

export function resolveSunoAssemblyPromptView(input: {
  project: VideoProject | null;
  logicalScenes: LogicalScene[];
  seedanceSegments: SeedanceSegment[];
}): SunoAssemblyPromptView {
  const recipeData = input.project?.recipeData;
  const v2Raw = recipeData?.sunoPromptV2;
  const v2 = v2Raw != null ? parseSunoPromptV2FromUnknown(v2Raw) : null;
  if (v2) {
    return { source: "v2", v2 };
  }

  const md = typeof recipeData?.sunoPrompt === "string" ? recipeData.sunoPrompt : null;
  if (md?.trim()) {
    return {
      source: "markdown",
      parsed: parseSunoMarkdownForAssembly(md),
    };
  }

  return {
    source: "fallback",
    prompt: buildSunoPrompt({
      project: input.project,
      logicalScenes: input.logicalScenes,
      seedanceSegments: input.seedanceSegments,
    }),
  };
}
