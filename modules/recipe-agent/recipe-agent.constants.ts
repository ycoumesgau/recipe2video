export const DEFAULT_RECIPE_AGENT_RUNTIME = "cloud";
export const DEFAULT_RECIPE_AGENT_MODEL = "composer-2";
export const DEFAULT_RECIPE_AGENT_STARTING_REF = "main";
export const RECIPE_AGENT_WORKSPACE_ROOT = "agent-recipes";

export const RECIPE_AGENT_ARTIFACT_NAMES = [
  "recipe-analysis.json",
  "decisions.md",
  "logical-scenes.json",
  "seedance-segments.json",
  "reference-plan.json",
  "suno-prompt.md",
  "changelog.md",
] as const;

export const RECIPE_AGENT_JSON_ARTIFACT_NAMES = [
  "recipe-analysis.json",
  "logical-scenes.json",
  "seedance-segments.json",
  "reference-plan.json",
] as const;
