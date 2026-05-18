import { ASSET_LIBRARY_CATEGORIES } from "@/modules/library/library.constants";

/**
 * Categories that are never used as visual anchors when generating a
 * recipe-specific reference image through GPT-Image 2.
 *
 * Rationale (per product decision 2026-05-18): the Licorn mascot adds
 * noise to dish-state references. Characters appear in unwanted places
 * (background tiles, counter tops) and the dish itself becomes harder to
 * read. The kitchen + utensil categories already carry the Licorn visual
 * identity (terrazzo countertop, induction layout, brand cookware),
 * which is enough to keep the anchor on-style without the model trying
 * to also place a mascot in the frame.
 *
 * Enforced at the resolver level so that any caller — the agent, the
 * operator-facing textarea, a future programmatic API — cannot bypass it.
 */
export const CONDITIONING_EXCLUDED_CATEGORIES = new Set<string>([
  "character",
  "character_expression",
  "character_pose",
]);

/**
 * Categories that CAN ground a recipe-specific reference. Derived from
 * `ASSET_LIBRARY_CATEGORIES` minus the excluded set so the policy is a
 * single source of truth: adding a new library category here will also
 * automatically include it in the conditioning allow-list unless it is
 * explicitly added to the excluded set above.
 */
export const CONDITIONING_ALLOWED_CATEGORIES = new Set<string>(
  ASSET_LIBRARY_CATEGORIES.filter(
    (category) => !CONDITIONING_EXCLUDED_CATEGORIES.has(category),
  ),
);

export function isConditioningExcludedCategory(category: string): boolean {
  return CONDITIONING_EXCLUDED_CATEGORIES.has(category);
}
