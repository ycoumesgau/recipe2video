/**
 * Filesystem- and skill-safe canonical name. Matches the seed convention
 * (`island_default`, `character-sheet`, `Facial-expressions`) so the
 * regenerated SKILL.md can embed the value inline without escaping.
 */
const CANONICAL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/** Aliases land in markdown as `@<alias>` so we restrict to identifier-style chars. */
const ALIAS_RE = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;

export function assertValidCanonicalName(value: string): string {
  const trimmed = value.trim();
  if (!CANONICAL_NAME_RE.test(trimmed)) {
    throw new Error(
      `canonical_name must match ${CANONICAL_NAME_RE} (letters/digits/_/-/. up to 80 chars). Got: '${value}'`,
    );
  }
  return trimmed;
}

export function normalizeAliases(input: readonly string[] | null | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!ALIAS_RE.test(trimmed)) {
      throw new Error(
        `alias must match ${ALIAS_RE} (letters/digits/_, must start with a letter). Got: '${trimmed}'`,
      );
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Parse a textarea / comma-separated input into a clean alias array. Empty
 * results are valid (an entry can have zero aliases).
 */
export function parseAliasesFromFreeText(input: string): string[] {
  return normalizeAliases(input.split(/[\s,;\n]+/g));
}

const LIBRARY_IMAGE_MIME = "image/png";
const LIBRARY_MAX_FILE_SIZE_BYTES = 32 * 1024 * 1024; // mirror the Storage bucket limit

export function assertValidLibraryImageFile(file: File): void {
  if (!file || file.size === 0) {
    throw new Error("Choose a PNG file before saving a library asset.");
  }
  if (file.type !== LIBRARY_IMAGE_MIME) {
    throw new Error(
      `Library assets must be PNG (got ${file.type || "unknown"}). The skill markdown links to .png paths.`,
    );
  }
  if (file.size > LIBRARY_MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Library image is too large (${file.size} bytes > ${LIBRARY_MAX_FILE_SIZE_BYTES}).`,
    );
  }
}
