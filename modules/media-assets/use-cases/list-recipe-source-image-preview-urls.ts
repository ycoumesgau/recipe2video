import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import {
  RECIPE_SOURCE_DASHBOARD_IMAGE_SIGNED_URL_TTL_SECONDS,
  type MediaStorageBucket,
} from "@/modules/media-assets/media-asset.constants";
import { isRecipeSourceImageFile } from "@/modules/media-assets/recipe-source-image-assets";
import { listRecipeSourceMediaAssetsByVideoIdAsc } from "@/modules/media-assets/repositories/media-asset.repository";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage-signed-url";

export interface RecipeSourceImagePreview {
  id: string;
  src: string;
  alt: string;
}

/**
 * Signed GET URLs for recipe_source images (dashboard). Objects live in Storage; tokens expire but
 * can be reissued on every request.
 */
export async function listRecipeSourceImagePreviewUrls(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<RecipeSourceImagePreview[]> {
  const assets = await listRecipeSourceMediaAssetsByVideoIdAsc(
    supabase,
    videoId,
  );
  const images = assets.filter(isRecipeSourceImageFile);
  const previews: RecipeSourceImagePreview[] = [];

  for (const asset of images) {
    const bucketRaw = asset.storageBucket ?? undefined;
    const path = asset.storagePath ?? undefined;

    if (!bucketRaw || !path) {
      continue;
    }

    const src = await createStorageSignedUrl(supabase, {
      bucket: bucketRaw as MediaStorageBucket,
      path,
      expiresInSeconds: RECIPE_SOURCE_DASHBOARD_IMAGE_SIGNED_URL_TTL_SECONDS,
    });

    previews.push({
      id: asset.id,
      src,
      alt: asset.originalFilename?.trim() || "Recipe photo",
    });
  }

  return previews;
}
