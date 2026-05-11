/**
 * Shared name-matching helpers used to compare a reference declared in
 * `segments.references[].name` (typically the alias the agent writes in
 * `seedance-segments.json`, e.g. `KitchenIslandDefault`) with the canonical
 * names returned by Supabase (e.g. `island_default`).
 *
 * The matcher is alias-aware: callers pass the full set of `canonicalName +
 * aliases` as `matchableNames`. Without this, the validator would mismatch a
 * library entry that the linker happily wired through `segment_references`
 * (which IS alias-aware), leaving segments stuck in "blocked" with a
 * misleading "could not be resolved" error.
 *
 * Normalization is intentionally tolerant: we lowercase, strip every
 * non-alphanumeric character, and compare. This survives small drifts like
 * `Character-sheet` vs `CharacterSheet` or `island_default` vs `IslandDefault`
 * without forcing every project to maintain a perfect alias list.
 */

export interface MatchableReference {
  canonicalName: string;
  aliases?: string[];
}

export function normalizeReferenceName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Build a Set of normalized keys for a list of references. Each reference
 * contributes its canonical name AND every alias, so the lookup matches
 * regardless of which form the caller queries with.
 */
export function buildMatchableNameSet(
  references: ReadonlyArray<MatchableReference>,
): Set<string> {
  const set = new Set<string>();
  for (const reference of references) {
    set.add(normalizeReferenceName(reference.canonicalName));
    for (const alias of reference.aliases ?? []) {
      set.add(normalizeReferenceName(alias));
    }
  }
  set.delete("");
  return set;
}

export function matchesReference(
  reference: MatchableReference,
  candidateName: string | null | undefined,
): boolean {
  const candidate = normalizeReferenceName(candidateName);
  if (!candidate) {
    return false;
  }
  if (normalizeReferenceName(reference.canonicalName) === candidate) {
    return true;
  }
  return (reference.aliases ?? []).some(
    (alias) => normalizeReferenceName(alias) === candidate,
  );
}
