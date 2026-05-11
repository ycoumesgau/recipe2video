import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { MEDIA_STORAGE_BUCKETS } from "@/modules/media-assets/media-asset.constants";
import {
  getMediaAssetById,
  insertStoredMediaAsset,
} from "@/modules/media-assets/repositories/media-asset.repository";
import { uploadStorageObject } from "@/modules/media-assets/services/storage.service";
import {
  getAssetLibraryById,
  setAssetLibraryMediaAsset,
  type AssetLibraryEntry,
} from "@/modules/references/repositories/asset-library.repository";

import { assertValidLibraryImageFile } from "../library.validation";

export interface ReplaceLibraryAssetMediaInput {
  assetLibraryId: string;
  file: File;
  createdBy?: string | null;
}

/**
 * Re-upload the image backing a library asset. We keep the same storage path
 * (so existing media_assets rows that reference it stay valid via the bucket
 * upsert), but we ALSO insert a new media_assets row pointing at the same
 * path. This gives us a clean audit trail of who replaced the image and when,
 * and bumps the library entry's `media_asset_id` to the fresh row.
 *
 * No skill regeneration happens here: the SKILL.md only references the
 * canonical name and folder, both unchanged by a media replacement.
 */
export async function replaceLibraryAssetMedia(
  supabase: SupabaseDataClient,
  input: ReplaceLibraryAssetMediaInput,
): Promise<AssetLibraryEntry> {
  assertValidLibraryImageFile(input.file);

  const entry = await getAssetLibraryById(supabase, input.assetLibraryId);
  if (!entry) {
    throw new Error(`asset_library row '${input.assetLibraryId}' not found`);
  }

  // Resolve the storage location either from the existing media row OR by
  // recomputing it from the canonical convention. The fallback covers entries
  // that lost their media_asset row (data migration accident).
  const currentMedia = entry.mediaAssetId
    ? await getMediaAssetById(supabase, entry.mediaAssetId)
    : null;
  const storagePath =
    currentMedia?.storagePath ?? `library/${entry.category}/${entry.canonicalName}.png`;

  await uploadStorageObject(supabase, {
    bucket: MEDIA_STORAGE_BUCKETS.referenceImages,
    path: storagePath,
    body: input.file,
    contentType: "image/png",
    upsert: true,
  });

  const newMediaAsset = await insertStoredMediaAsset(supabase, {
    videoId: null,
    type: "reference_image",
    provider: "manual",
    storageBucket: MEDIA_STORAGE_BUCKETS.referenceImages,
    storagePath,
    originalFilename: input.file.name,
    mimeType: "image/png",
    fileSizeBytes: input.file.size,
    metadata: {
      source: "library_admin_replace",
      canonicalName: entry.canonicalName,
      category: entry.category,
      previousMediaAssetId: entry.mediaAssetId,
    },
    createdBy: input.createdBy ?? null,
  });

  return setAssetLibraryMediaAsset(
    supabase,
    entry.id,
    newMediaAsset.id,
  );
}
