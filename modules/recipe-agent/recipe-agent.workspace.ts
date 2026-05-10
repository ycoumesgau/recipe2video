import {
  RECIPE_AGENT_ARTIFACT_NAMES,
  RECIPE_AGENT_WORKSPACE_ROOT,
} from "./recipe-agent.constants";
import type {
  RecipeAgentArtifactName,
  RecipeAgentWorkspace,
} from "./recipe-agent.types";

export function buildRecipeAgentWorkspace(videoId: string): RecipeAgentWorkspace {
  const safeVideoId = sanitizeWorkspaceSegment(videoId);
  const workspacePath = `${RECIPE_AGENT_WORKSPACE_ROOT}/${safeVideoId}`;
  const artifactPaths = Object.fromEntries(
    RECIPE_AGENT_ARTIFACT_NAMES.map((name) => [
      name,
      `${workspacePath}/${name}`,
    ]),
  ) as Record<RecipeAgentArtifactName, string>;

  return {
    videoId,
    workspacePath,
    artifactPaths,
  };
}

export function getRecipeAgentArtifactName(path: string) {
  const fileName = path.split(/[\\/]/).pop() ?? path;

  return RECIPE_AGENT_ARTIFACT_NAMES.includes(
    fileName as RecipeAgentArtifactName,
  )
    ? (fileName as RecipeAgentArtifactName)
    : fileName;
}

function sanitizeWorkspaceSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}
