/**
 * Build signed preview URLs for canonical names declared on song-cover
 * artifacts (album cover conditioning refs, Canvas image/video refs).
 * Uses the same lookup order as `resolveSongCoverReferences`.
 */

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage-signed-url";
import { normalizeReferenceName } from "@/modules/references/reference-matching";
import type { AssetLibraryEntry } from "@/modules/references/repositories/asset-library.repository";
import { findAssetLibraryByCanonicalNames } from "@/modules/references/repositories/asset-library.repository";
import { listReferenceAssetsForVideo } from "@/modules/references/repositories/reference.repository";
import type { ReferenceAsset } from "@/modules/references/reference.types";

import type { SongCoverReferencePreview } from "../song-cover.types";

const PREVIEW_TTL_SECONDS = 60 * 60;

type MediaAssetStoragePick = Pick<
  Database["public"]["Tables"]["media_assets"]["Row"],
  "id" | "storage_bucket" | "storage_path" | "mime_type"
>;

export interface ResolveSongCoverReferencePreviewsInput {
  videoId: string;
  requestedNames: string[];
}

export async function resolveSongCoverReferencePreviews(
  supabase: SupabaseDataClient,
  input: ResolveSongCoverReferencePreviewsInput,
): Promise<SongCoverReferencePreview[]> {
  const trimmed = input.requestedNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  if (trimmed.length === 0) {
    return [];
  }

  const libraryIndex = await findAssetLibraryByCanonicalNames(supabase, trimmed);
  const recipeRefs = await listReferenceAssetsForVideo(supabase, input.videoId);
  const recipeByName = buildRecipeRefNameIndex(recipeRefs);

  const mediaAssetIds = new Set<string>();
  for (const entry of libraryIndex.values()) {
    if (entry.mediaAssetId) mediaAssetIds.add(entry.mediaAssetId);
  }
  for (const ref of recipeRefs) {
    if (ref.mediaAssetId) mediaAssetIds.add(ref.mediaAssetId);
  }

  const mediaById = await fetchMediaAssetStorageLocations(
    supabase,
    Array.from(mediaAssetIds),
  );

  const previews: SongCoverReferencePreview[] = [];
  const seenLibraryIds = new Set<string>();
  const seenRecipeIds = new Set<string>();

  for (const requestedName of trimmed) {
    const libraryEntry =
      libraryIndex.get(requestedName) ??
      libraryIndex.get(normalizeReferenceName(requestedName));

    if (libraryEntry) {
      if (seenLibraryIds.has(libraryEntry.id)) {
        continue;
      }
      seenLibraryIds.add(libraryEntry.id);

      const preview = await previewFromLibraryEntry(
        supabase,
        libraryEntry,
        mediaById,
      );
      if (preview) previews.push(preview);
      continue;
    }

    const recipeEntry =
      recipeByName.get(requestedName) ??
      recipeByName.get(normalizeReferenceName(requestedName));

    if (!recipeEntry || !recipeEntry.mediaAssetId) {
      continue;
    }

    if (seenRecipeIds.has(recipeEntry.id)) {
      continue;
    }
    seenRecipeIds.add(recipeEntry.id);

    const preview = await previewFromRecipeRef(
      supabase,
      recipeEntry,
      mediaById,
    );
    if (preview) previews.push(preview);
  }

  return previews;
}

function buildRecipeRefNameIndex(
  recipeRefs: ReferenceAsset[],
): Map<string, ReferenceAsset> {
  const index = new Map<string, ReferenceAsset>();
  for (const ref of recipeRefs) {
    index.set(ref.canonicalName, ref);
    index.set(normalizeReferenceName(ref.canonicalName), ref);
    for (const alias of ref.aliases ?? []) {
      index.set(alias, ref);
      index.set(normalizeReferenceName(alias), ref);
    }
  }
  return index;
}

async function previewFromLibraryEntry(
  supabase: SupabaseDataClient,
  entry: AssetLibraryEntry,
  mediaById: Map<string, MediaAssetStoragePick>,
): Promise<SongCoverReferencePreview | null> {
  const media = entry.mediaAssetId ? mediaById.get(entry.mediaAssetId) : null;
  const previewUrl = await signedPreviewUrl(supabase, media);
  const kind = classifyKindFromMime(media?.mime_type);

  return {
    canonicalName: entry.canonicalName,
    tag: entry.aliases[0]?.trim() || entry.canonicalName,
    category: entry.category,
    source: "asset_library",
    previewUrl,
    kind,
  };
}

async function previewFromRecipeRef(
  supabase: SupabaseDataClient,
  ref: ReferenceAsset,
  mediaById: Map<string, MediaAssetStoragePick>,
): Promise<SongCoverReferencePreview | null> {
  const media = ref.mediaAssetId ? mediaById.get(ref.mediaAssetId) : null;
  const previewUrl = await signedPreviewUrl(supabase, media);
  const kind = classifyKindFromMime(media?.mime_type);

  return {
    canonicalName: ref.canonicalName,
    tag: ref.canonicalName,
    category: ref.type,
    source: "reference_assets",
    previewUrl,
    kind,
  };
}

async function signedPreviewUrl(
  supabase: SupabaseDataClient,
  media: MediaAssetStoragePick | null | undefined,
): Promise<string | null> {
  if (!media?.storage_bucket || !media.storage_path) {
    return null;
  }
  try {
    return await createStorageSignedUrl(supabase, {
      bucket: media.storage_bucket as MediaStorageBucket,
      path: media.storage_path,
      expiresInSeconds: PREVIEW_TTL_SECONDS,
    });
  } catch {
    return null;
  }
}

function classifyKindFromMime(
  mimeType: string | null | undefined,
): SongCoverReferencePreview["kind"] {
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
    .select("id, storage_bucket, storage_path, mime_type")
    .in("id", mediaAssetIds);

  throwIfSupabaseError(error, "resolveSongCoverReferencePreviews media fetch failed");
  const map = new Map<string, MediaAssetStoragePick>();
  for (const row of data ?? []) {
    map.set(row.id, row);
  }
  return map;
}
