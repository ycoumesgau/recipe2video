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
