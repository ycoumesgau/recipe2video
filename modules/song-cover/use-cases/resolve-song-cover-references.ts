/**
 * Resolve the list of canonical names declared on a song-cover artifact
 * into Runway-ready references for both the album cover (GPT-Image 2
 * `referenceImages[]`) and the Spotify Canvas (Seedance 2 `references[]`
 * for images, `referenceVideos[]` for videos).
 *
 * Lookup order, identical to the existing references / segments
 * resolvers so the operator never gets a different answer for the same
 * name across tabs:
 *   1. `asset_library` (globals — kitchen, character, pose, expression,
 *      utensil, video globals such as `LicornOutroVideo`).
 *   2. `reference_assets` (per-video, recipe-specific entries declared
 *      by the agent in `reference-plan.json`).
 *
 * Throws when a canonical name resolves to a `media_assets` row with no
 * storage path: that means the underlying file was never uploaded and
 * Runway cannot consume it. Unresolved names (no match at all) are
 * returned in `unresolvedNames` so the caller decides whether to skip
 * the generation or surface a warning.
 */

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage-signed-url";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import { findAssetLibraryByCanonicalNames } from "@/modules/references/repositories/asset-library.repository";
import { listReferenceAssetsForVideo } from "@/modules/references/repositories/reference.repository";

type MediaAssetStoragePick = Pick<
  Database["public"]["Tables"]["media_assets"]["Row"],
  | "id"
  | "storage_bucket"
  | "storage_path"
  | "file_size_bytes"
  | "mime_type"
  | "duration_seconds"
>;

const SIGNED_URL_TTL_SECONDS = 60 * 15;

export interface ResolvedSongCoverReference {
  requestedName: string;
  canonicalName: string;
  source: "asset_library" | "reference_assets";
  kind: "image" | "video";
  uri: string;
  fileSizeBytes: number;
  mimeType: string | null;
  durationSeconds: number | null;
}

export interface ResolveSongCoverReferencesResult {
  references: ResolvedSongCoverReference[];
  unresolvedNames: string[];
}

export interface ResolveSongCoverReferencesInput {
  videoId: string;
  requestedNames: string[];
}

export async function resolveSongCoverReferences(
  supabase: SupabaseDataClient,
  input: ResolveSongCoverReferencesInput,
): Promise<ResolveSongCoverReferencesResult> {
  const trimmed = input.requestedNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  if (trimmed.length === 0) {
    return { references: [], unresolvedNames: [] };
  }

  const libraryIndex = await findAssetLibraryByCanonicalNames(supabase, trimmed);
  const recipeRefs = await listReferenceAssetsForVideo(supabase, input.videoId);
  const recipeRefByName = new Map(
    recipeRefs.map((reference) => [reference.canonicalName, reference]),
  );

  const mediaAssetIds = new Set<string>();
  for (const entry of new Set(libraryIndex.values())) {
    if (entry.mediaAssetId) mediaAssetIds.add(entry.mediaAssetId);
  }
  for (const ref of recipeRefs) {
    if (ref.mediaAssetId) mediaAssetIds.add(ref.mediaAssetId);
  }

  const mediaById = await fetchMediaAssetStorageLocations(
    supabase,
    Array.from(mediaAssetIds),
  );

  const references: ResolvedSongCoverReference[] = [];
  const unresolvedNames: string[] = [];

  for (const name of trimmed) {
    const libraryEntry = libraryIndex.get(name);
    if (libraryEntry) {
      const media = libraryEntry.mediaAssetId
        ? mediaById.get(libraryEntry.mediaAssetId)
        : null;
      if (!media || !media.storage_bucket || !media.storage_path) {
        unresolvedNames.push(name);
        continue;
      }
      const uri = await createStorageSignedUrl(supabase, {
        bucket: media.storage_bucket as MediaStorageBucket,
        path: media.storage_path,
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      });
      references.push({
        requestedName: name,
        canonicalName: libraryEntry.canonicalName,
        source: "asset_library",
        kind: classifyKindFromMime(media.mime_type),
        uri,
        fileSizeBytes: media.file_size_bytes ?? 0,
        mimeType: media.mime_type ?? null,
        durationSeconds: media.duration_seconds ?? null,
      });
      continue;
    }

    const recipeRef = recipeRefByName.get(name);
    if (recipeRef) {
      const media = recipeRef.mediaAssetId
        ? mediaById.get(recipeRef.mediaAssetId)
        : null;
      if (!media || !media.storage_bucket || !media.storage_path) {
        unresolvedNames.push(name);
        continue;
      }
      const uri = await createStorageSignedUrl(supabase, {
        bucket: media.storage_bucket as MediaStorageBucket,
        path: media.storage_path,
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      });
      references.push({
        requestedName: name,
        canonicalName: recipeRef.canonicalName,
        source: "reference_assets",
        kind: classifyKindFromMime(media.mime_type),
        uri,
        fileSizeBytes: media.file_size_bytes ?? 0,
        mimeType: media.mime_type ?? null,
        durationSeconds: media.duration_seconds ?? null,
      });
      continue;
    }

    unresolvedNames.push(name);
  }

  return { references, unresolvedNames };
}

function classifyKindFromMime(mimeType: string | null | undefined): "image" | "video" {
  if (mimeType?.startsWith("video/")) return "video";
  return "image";
}

async function fetchMediaAssetStorageLocations(
  supabase: SupabaseDataClient,
  mediaAssetIds: string[],
): Promise<Map<string, MediaAssetStoragePick>> {
  if (mediaAssetIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("media_assets")
    .select(
      "id, storage_bucket, storage_path, file_size_bytes, mime_type, duration_seconds",
    )
    .in("id", mediaAssetIds);

  throwIfSupabaseError(error, "fetchMediaAssetStorageLocations failed");
  const map = new Map<string, MediaAssetStoragePick>();
  for (const row of data ?? []) {
    map.set(row.id, row);
  }
  return map;
}
