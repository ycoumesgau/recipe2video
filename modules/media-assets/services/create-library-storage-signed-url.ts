import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import { getLegacyStoragePathsForCanonical } from "@/modules/library/library-legacy-storage-paths";

import type { MediaStorageBucket } from "../media-asset.constants";
import { tryCreateStorageSignedUrl } from "./storage-signed-url";

export interface LibraryStorageSignedUrlInput {
  bucket: MediaStorageBucket;
  /** Primary path from `media_assets.storage_path`. */
  path: string;
  /** Library `canonical_name` — used to look up legacy fallbacks. */
  libraryCanonicalName?: string;
  expiresInSeconds?: number;
}

/**
 * Mint a signed URL for a library global, trying legacy storage paths when the
 * primary object is missing (common right after a canonical rename).
 */
export async function createLibraryStorageSignedUrl(
  supabase: SupabaseDataClient,
  input: LibraryStorageSignedUrlInput,
): Promise<string> {
  const url = await tryCreateLibraryStorageSignedUrl(supabase, input);
  if (!url) {
    throw new Error(
      `Supabase Storage signed URL failed for library asset '${input.libraryCanonicalName ?? input.path}' (primary: ${input.path}).`,
    );
  }
  return url;
}

/**
 * Same as {@link createLibraryStorageSignedUrl} but returns `null` when every
 * candidate path fails (missing object or signing error).
 */
export async function tryCreateLibraryStorageSignedUrl(
  supabase: SupabaseDataClient,
  input: LibraryStorageSignedUrlInput,
): Promise<string | null> {
  const legacy =
    input.libraryCanonicalName != null
      ? getLegacyStoragePathsForCanonical(input.libraryCanonicalName)
      : [];
  const candidates = uniquePaths([input.path, ...legacy]);

  for (const path of candidates) {
    const signed = await tryCreateStorageSignedUrl(supabase, {
      bucket: input.bucket,
      path,
      expiresInSeconds: input.expiresInSeconds,
    });
    if (signed) {
      return signed;
    }
  }

  return null;
}

function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    result.push(path);
  }
  return result;
}
