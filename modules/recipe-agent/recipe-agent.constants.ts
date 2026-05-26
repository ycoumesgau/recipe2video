export const DEFAULT_RECIPE_AGENT_RUNTIME = "cloud";
export const DEFAULT_RECIPE_AGENT_MODEL = "gpt-5.5";
export const DEFAULT_RECIPE_AGENT_STARTING_REF = "main";
export const RECIPE_AGENT_WORKSPACE_ROOT = "agent-recipes";

/** Written by the agent so Recipe2Video can fetch artifacts by commit SHA. */
export const RECIPE_AGENT_CHECKPOINT_MANIFEST = "checkpoint-manifest.json";

export const RECIPE_AGENT_ARTIFACT_NAMES = [
  "recipe-analysis.json",
  "decisions.md",
  "logical-scenes.json",
  "seedance-segments.json",
  "reference-plan.json",
  "suno-prompt.json",
  "suno-prompt.md",
  "changelog.md",
  "song-cover-plan.json",
] as const;

export const RECIPE_AGENT_JSON_ARTIFACT_NAMES = [
  "recipe-analysis.json",
  "logical-scenes.json",
  "seedance-segments.json",
  "reference-plan.json",
  "suno-prompt.json",
  "song-cover-plan.json",
] as const;

/**
 * Artifacts the recipe agent produces only on operator request (the
 * checkpoint manifest may legitimately omit them). The sync use case
 * skips its hard validation when one of these is absent and merely
 * leaves the corresponding domain row empty.
 */
export const RECIPE_AGENT_OPTIONAL_ARTIFACT_NAMES = [
  "song-cover-plan.json",
] as const;

/**
 * Default wall-clock budget for Cursor SDK recipe agent runs (Inngest polling).
 * Reference image generation uses {@link REFERENCE_IMAGE_MAX_POLL_DURATION_MS}
 * in `modules/references/use-cases/reference-image-poll-workflow.ts` instead.
 */
export const RECIPE_AGENT_CURSOR_RUN_MAX_DURATION_MS = 30 * 60 * 1000;

/** Wall-clock budget per stage for Cursor agent run polling. */
export const RECIPE_AGENT_RUN_MAX_DURATION_MS_BY_STAGE = {
  recipe_ingest: RECIPE_AGENT_CURSOR_RUN_MAX_DURATION_MS,
  seedance_segmentation: RECIPE_AGENT_CURSOR_RUN_MAX_DURATION_MS,
  default: RECIPE_AGENT_CURSOR_RUN_MAX_DURATION_MS,
} as const;

export const RECIPE_AGENT_POLL_MIN_DELAY_SECONDS = 5;
export const RECIPE_AGENT_POLL_MAX_DELAY_SECONDS = 30;
export const RECIPE_AGENT_RECONCILE_STUCK_AFTER_MS = 35 * 60 * 1000;
export const RECIPE_AGENT_STREAM_SLICE_MAX_MS = 3 * 60 * 1000;

export function resolveRecipeAgentRunMaxDurationMs(
  stage: keyof typeof RECIPE_AGENT_RUN_MAX_DURATION_MS_BY_STAGE | string,
): number {
  if (stage in RECIPE_AGENT_RUN_MAX_DURATION_MS_BY_STAGE) {
    return RECIPE_AGENT_RUN_MAX_DURATION_MS_BY_STAGE[
      stage as keyof typeof RECIPE_AGENT_RUN_MAX_DURATION_MS_BY_STAGE
    ];
  }

  return RECIPE_AGENT_RUN_MAX_DURATION_MS_BY_STAGE.default;
}
