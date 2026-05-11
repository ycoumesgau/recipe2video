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
] as const;

export const RECIPE_AGENT_JSON_ARTIFACT_NAMES = [
  "recipe-analysis.json",
  "logical-scenes.json",
  "seedance-segments.json",
  "reference-plan.json",
  "suno-prompt.json",
] as const;
