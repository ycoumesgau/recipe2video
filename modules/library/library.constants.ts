/**
 * Canonical asset library categories.
 *
 * Keep this list aligned with:
 * - `scripts/seed-asset-library.ts` (folder → category mapping)
 * - `recipe2video-agent-workspace/.cursor/skills/asset-reference-system/SKILL.md`
 *   (categories the agent expects to find in its skill)
 *
 * Order matters: it drives both the display order on the /library page AND the
 * order of sections in the regenerated SKILL.md.
 */
export const ASSET_LIBRARY_CATEGORIES = [
  "kitchen",
  "character",
  "character_expression",
  "character_pose",
  "utensil",
] as const;

export type AssetLibraryCategory = (typeof ASSET_LIBRARY_CATEGORIES)[number];

export function isAssetLibraryCategory(
  value: string,
): value is AssetLibraryCategory {
  return (ASSET_LIBRARY_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The agent workspace stores assets under sub-folders that DO NOT map 1:1 to
 * the DB `category` enum because the `character/` folder mixes three logical
 * roles (master sheet, expressions board, pose boards). This map reverses the
 * convention used by `scripts/seed-asset-library.ts::resolveCategoryForCharacterFile`.
 */
export const ASSET_LIBRARY_WORKSPACE_FOLDER_BY_CATEGORY: Record<
  AssetLibraryCategory,
  string
> = {
  kitchen: "kitchen",
  character: "character",
  character_expression: "character",
  character_pose: "character",
  utensil: "ustensils",
};

export const ASSET_LIBRARY_CATEGORY_DISPLAY: Record<
  AssetLibraryCategory,
  string
> = {
  kitchen: "Kitchen",
  character: "Character (master sheet)",
  character_expression: "Character expressions",
  character_pose: "Character poses",
  utensil: "Utensils",
};

/**
 * Path inside the agent workspace repo where the skill markdown lives. The
 * agent expects this exact location at every run.
 */
export const ASSET_REFERENCE_SKILL_PATH =
  ".cursor/skills/asset-reference-system/SKILL.md";

/**
 * Default commit message prefix used when the library admin pushes a new skill
 * version to the agent workspace.
 */
export const ASSET_REFERENCE_SKILL_COMMIT_PREFIX =
  "chore(asset-reference-system)";
