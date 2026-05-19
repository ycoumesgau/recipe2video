import { ASSET_LIBRARY_CATEGORIES } from "@/modules/library/library.constants";

/**
 * Identifies the artifact a conditioning anchor will ground at generation
 * time. Each context picks its own excluded set:
 *
 *   * `recipe_state`   : default — used when generating a recipe-specific
 *                        reference image (the kitchen-state, raw, baked,
 *                        filled, cut, glazed, broken, final dish states).
 *                        Excludes character anchors because they add noise
 *                        to dish references (the kitchen + utensil set
 *                        already carries the brand visual identity).
 *   * `album_cover`    : streaming album cover. The mascot is the hero
 *                        of the artwork, so character anchors are
 *                        encouraged and nothing is excluded.
 *   * `spotify_canvas` : Seedance 2 loop. We pass `references[]` and
 *                        `referenceVideos[]` directly (no GPT-Image
 *                        conditioning anchors here), but the context is
 *                        kept symmetrical so future helpers can branch on
 *                        the same enum.
 *
 * The legacy `recipe_state` policy lives in
 * `CONDITIONING_EXCLUDED_CATEGORIES`.
 */
export type ConditioningContext =
  | "recipe_state"
  | "album_cover"
  | "spotify_canvas";

/**
 * Categories that are never used as visual anchors when generating a
 * recipe-specific reference image through GPT-Image 2 in the default
 * `recipe_state` context.
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
 * Categories that CAN ground a recipe-specific reference in the default
 * `recipe_state` context. Derived from `ASSET_LIBRARY_CATEGORIES` minus
 * the excluded set so the policy is a single source of truth: adding a
 * new library category here will also automatically include it in the
 * conditioning allow-list unless it is explicitly added to the excluded
 * set above.
 */
export const CONDITIONING_ALLOWED_CATEGORIES = new Set<string>(
  ASSET_LIBRARY_CATEGORIES.filter(
    (category) => !CONDITIONING_EXCLUDED_CATEGORIES.has(category),
  ),
);

/**
 * Returns the categories excluded for a given conditioning context.
 *
 * `album_cover` and `spotify_canvas` allow every library category — the
 * Licorn mascot is the hero of the album artwork and a planned visitor
 * inside the Canvas loop. The default `recipe_state` keeps the legacy
 * exclusion of character categories.
 */
export function getExcludedConditioningCategories(
  context: ConditioningContext = "recipe_state",
): Set<string> {
  if (context === "album_cover" || context === "spotify_canvas") {
    return new Set<string>();
  }
  return CONDITIONING_EXCLUDED_CATEGORIES;
}

export function isConditioningExcludedCategory(
  category: string,
  context: ConditioningContext = "recipe_state",
): boolean {
  return getExcludedConditioningCategories(context).has(category);
}
