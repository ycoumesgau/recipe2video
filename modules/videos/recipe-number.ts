export const MIN_RECIPE_NUMBER = 1;
export const MAX_RECIPE_NUMBER = 999_999;

export function parseRecipeNumberInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    return null;
  }

  if (value < MIN_RECIPE_NUMBER || value > MAX_RECIPE_NUMBER) {
    return null;
  }

  return value;
}

export function formatRecipeNumberLabel(recipeNumber: number): string {
  return String(recipeNumber);
}
