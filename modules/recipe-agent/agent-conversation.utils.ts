import { buildRecipeAgentWorkspace } from "./recipe-agent.workspace";

export const AVAILABLE_ASSETS_MANIFEST_FILENAME = "available-assets.json";

export function slugifyConversationName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug.length > 0 ? slug : "conversation";
}

export function buildConversationGitBranch(videoId: string, slug: string): string {
  return `recipe2video/${videoId}/${slug}`;
}

export function buildLegacyConversationGitBranch(videoId: string): string {
  return `recipe2video/${videoId}`;
}

export function buildAvailableAssetsManifestPath(videoId: string): string {
  const workspace = buildRecipeAgentWorkspace(videoId);
  return `${workspace.workspacePath}/${AVAILABLE_ASSETS_MANIFEST_FILENAME}`;
}
