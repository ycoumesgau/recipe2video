import type { RecipeData, RecipeSourceSummary, RecipeSourceType } from "./video.types";

function isRecipeSourceType(value: unknown): value is RecipeSourceType {
  return (
    value === "url" ||
    value === "photos" ||
    value === "text" ||
    value === "demo"
  );
}

/**
 * Best-effort parse of `videos.recipe_data.source` for orchestration (e.g. photos → vision).
 */
export function getRecipeSourceSummaryFromRecipeData(
  recipeData: RecipeData | null | undefined,
): RecipeSourceSummary | null {
  if (!recipeData || typeof recipeData !== "object") {
    return null;
  }

  const raw = (recipeData as Record<string, unknown>).source;
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const type = source.type;

  if (!isRecipeSourceType(type)) {
    return null;
  }

  return {
    type,
    recipeUrl:
      typeof source.recipeUrl === "string"
        ? source.recipeUrl
        : source.recipeUrl === null
          ? null
          : undefined,
    pastedTextPreview:
      typeof source.pastedTextPreview === "string"
        ? source.pastedTextPreview
        : source.pastedTextPreview === null
          ? null
          : undefined,
    demoRecipeId:
      typeof source.demoRecipeId === "string"
        ? source.demoRecipeId
        : source.demoRecipeId === null
          ? null
          : undefined,
    uploadedFileNames: Array.isArray(source.uploadedFileNames)
      ? source.uploadedFileNames.filter((x): x is string => typeof x === "string")
      : undefined,
  };
}
