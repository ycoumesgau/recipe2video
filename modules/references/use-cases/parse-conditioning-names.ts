/**
 * Normalize the operator-provided conditioning input from the references
 * UI into a clean list of canonical names.
 *
 * The textarea accepts either newline-separated or comma-separated names,
 * and tolerates the `@` prefix from the asset-reference-system skill
 * markdown (the operator can copy-paste `@KitchenIslandDefault,
 * @SquareBakingDish` straight from the skill). Trailing whitespace and
 * duplicates are removed; ordering is preserved so the agent's declared
 * priority survives the round-trip.
 *
 * Lookup against `asset_library` is case-insensitive and follows aliases,
 * so we deliberately do NOT lowercase here — keeping the operator's
 * exact casing makes diffs in `decisions.md` more readable when the agent
 * later edits the plan.
 */
export function parseConditioningNames(raw: string): string[] {
  if (!raw) {
    return [];
  }

  const tokens = raw
    .split(/[\n,]+/)
    .map((token) => token.trim().replace(/^@+/, ""))
    .filter((token) => token.length > 0);

  return Array.from(new Set(tokens));
}
