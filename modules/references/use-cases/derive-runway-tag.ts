/**
 * Maximum length Runway accepts for a `referenceImages[].tag` value on
 * `POST /v1/text_to_image`. Validated against the live API on 2026-05-18:
 *
 *   "Too big: expected string to have <=16 characters"
 *
 * The tag is the @-handle GPT-Image 2 matches against the `@Tag` mentions
 * embedded in `promptText`. It MUST therefore be the same string in both
 * places, which is why we centralize the derivation here.
 */
export const RUNWAY_TAG_MAX_LENGTH = 16;

/**
 * Build a Runway-safe tag from an asset_library canonical_name or alias.
 *
 * Steps:
 *   1. Strip every non-alphanumeric character — Runway's tag matcher is
 *      finicky about hyphens / underscores, and the @-mention parser in
 *      GPT-Image 2 ends at the first non-identifier char. Stripping here
 *      keeps the prompt mention and the tag identical.
 *   2. Truncate to 16 characters so Runway accepts the payload.
 *   3. Capitalize the first letter when the input happened to start with
 *      a non-alphanumeric character (e.g. `island_default` → `islandDef`
 *      becomes `IslandDef`). Pure cosmetic; helps the @-mention stay
 *      readable in the operator-facing prompt log.
 *
 * Examples:
 *   - `KitchenIslandDefault` (20)         → `KitchenIslandDef`
 *   - `island_default`                    → `IslandDefault`
 *   - `Character-sheet`                   → `CharacterSheet`
 *   - `Luma-threeQuarterRight-pose` (27)  → `LumathreeQuarte`
 */
export function deriveRunwayTag(rawName: string): string {
  // Promote each segment between non-alphanumeric separators to PascalCase
  // so that `Character-sheet` → `CharacterSheet` and `baking_dish` →
  // `BakingDish`. This keeps the @-mention readable for operators
  // inspecting Runway logs and matches how the agent already writes
  // multi-word aliases in the skill markdown.
  const pascal = rawName
    .split(/[^A-Za-z0-9]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      segment.length === 0
        ? segment
        : segment[0]!.toUpperCase() + segment.slice(1),
    )
    .join("");
  return pascal.slice(0, RUNWAY_TAG_MAX_LENGTH);
}

/**
 * Make a list of tags unique by suffixing collisions with the smallest
 * integer that keeps the result inside `RUNWAY_TAG_MAX_LENGTH` characters.
 *
 * Two different library aliases with the same first 16 alphanumeric
 * characters would otherwise collide on a single `tag` value, and Runway
 * would refuse the request (`tag` is the only thing the model uses to
 * disambiguate references in the prompt). Real-world collisions are rare
 * but possible (`KitchenLayoutContext` truncates to `KitchenLayoutCo` for
 * both `…ContextWide` and `…ContextNarrow`-style aliases).
 *
 * Order is preserved so the first occurrence keeps the clean tag.
 */
export function makeRunwayTagsUnique(rawTags: string[]): string[] {
  const seen = new Map<string, number>();
  const result: string[] = [];
  for (const raw of rawTags) {
    const base = raw.slice(0, RUNWAY_TAG_MAX_LENGTH);
    const count = seen.get(base) ?? 0;
    if (count === 0) {
      seen.set(base, 1);
      result.push(base);
      continue;
    }
    // Append the smallest suffix that does not break the 16-char cap.
    let suffix = count + 1;
    let candidate = `${base.slice(0, RUNWAY_TAG_MAX_LENGTH - String(suffix).length)}${suffix}`;
    while (seen.has(candidate)) {
      suffix += 1;
      candidate = `${base.slice(0, RUNWAY_TAG_MAX_LENGTH - String(suffix).length)}${suffix}`;
    }
    seen.set(candidate, 1);
    seen.set(base, count + 1);
    result.push(candidate);
  }
  return result;
}
