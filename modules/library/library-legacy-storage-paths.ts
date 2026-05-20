/**
 * Storage paths that still exist under an older filename after a library
 * canonical_name rename. The DB row and `media_assets.storage_path` point at
 * the new path; operators may not have copied the object yet. Resolvers try
 * these fallbacks when signing the primary path fails so previews, GPT-Image
 * conditioning, and Seedance references keep working.
 */
export const LIBRARY_LEGACY_STORAGE_PATHS: Readonly<
  Record<string, readonly string[]>
> = {
  silicone_spatula: ["library/utensil/spatula.png"],
};

export function getLegacyStoragePathsForCanonical(
  canonicalName: string,
): readonly string[] {
  return LIBRARY_LEGACY_STORAGE_PATHS[canonicalName] ?? [];
}
