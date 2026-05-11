import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { MEDIA_STORAGE_BUCKETS } from "@/modules/media-assets/media-asset.constants";
import { insertStoredMediaAsset } from "@/modules/media-assets/repositories/media-asset.repository";
import { uploadStorageObject } from "@/modules/media-assets/services/storage.service";
import {
  createAssetLibraryEntry,
  getAssetLibraryByCanonicalName,
  type AssetLibraryEntry,
} from "@/modules/references/repositories/asset-library.repository";

import {
  type AssetLibraryCategory,
  isAssetLibraryCategory,
} from "../library.constants";
import {
  assertValidCanonicalName,
  assertValidLibraryImageFile,
  normalizeAliases,
} from "../library.validation";
import { regenerateAssetReferenceSkill } from "./regenerate-asset-reference-skill";

export interface CreateLibraryAssetInput {
  file: File;
  canonicalName: string;
  category: AssetLibraryCategory | string;
  aliases?: readonly string[];
  description?: string | null;
  createdBy?: string | null;
}

export interface CreateLibraryAssetResult {
  entry: AssetLibraryEntry;
  skill: Awaited<ReturnType<typeof regenerateAssetReferenceSkill>>;
}

/**
 * Create a brand new global library asset and (best-effort) republish the
 * asset-reference-system skill so the agent sees it on its next run.
 *
 * Storage path convention mirrors `scripts/seed-asset-library.ts`:
 *     library/<category>/<canonical_name>.png
 *
 * The canonical_name is immutable once created; to rename, the operator
 * should deprecate the old entry and create a new one (see the /library page
 * help text).
 */
export async function createLibraryAsset(
  supabase: SupabaseDataClient,
  input: CreateLibraryAssetInput,
): Promise<CreateLibraryAssetResult> {
  assertValidLibraryImageFile(input.file);
  const canonicalName = assertValidCanonicalName(input.canonicalName);

  if (!isAssetLibraryCategory(input.category)) {
    throw new Error(
      `Invalid category '${input.category}'. Use one of the canonical library categories.`,
    );
  }
  const category = input.category;

  const aliases = normalizeAliases(input.aliases);

  const existing = await getAssetLibraryByCanonicalName(supabase, canonicalName);
  if (existing) {
    throw new Error(
      `An asset with canonical_name '${canonicalName}' already exists. Pick a different name or use 'Replace image' on the existing entry.`,
    );
  }

  const storagePath = `library/${category}/${canonicalName}.png`;
  await uploadStorageObject(supabase, {
    bucket: MEDIA_STORAGE_BUCKETS.referenceImages,
    path: storagePath,
    body: input.file,
    contentType: "image/png",
    // Replace any leftover orphan object (the row was never created, so the
    // path is effectively free). Without upsert, a previous failed create
    // would block ever using that canonical name again.
    upsert: true,
  });

  const mediaAsset = await insertStoredMediaAsset(supabase, {
    videoId: null,
    type: "reference_image",
    provider: "manual",
    storageBucket: MEDIA_STORAGE_BUCKETS.referenceImages,
    storagePath,
    originalFilename: input.file.name,
    mimeType: "image/png",
    fileSizeBytes: input.file.size,
    metadata: {
      source: "library_admin_create",
      canonicalName,
      category,
    },
    createdBy: input.createdBy ?? null,
  });

  const entry = await createAssetLibraryEntry(supabase, {
    canonicalName,
    category,
    aliases,
    description: input.description?.trim() || null,
    mediaAssetId: mediaAsset.id,
    status: "active",
    createdBy: input.createdBy ?? null,
  });

  const skill = await regenerateAssetReferenceSkill(supabase, {
    reason: `add ${canonicalName}`,
  });

  return { entry, skill };
}
