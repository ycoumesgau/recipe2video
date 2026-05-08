import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import type { RecipeSourceMediaAssetInput } from "../media-asset.types";

export async function insertRecipeSourceMediaAssets(
  supabase: SupabaseDataClient,
  assets: RecipeSourceMediaAssetInput[],
) {
  if (assets.length === 0) {
    return;
  }

  const { error } = await supabase.from("media_assets").insert(
    assets.map((asset) => ({
      video_id: asset.videoId,
      type: "recipe_source",
      provider: "supabase",
      storage_bucket: asset.storageBucket,
      storage_path: asset.storagePath,
      original_filename: asset.originalFilename,
      mime_type: asset.mimeType,
      file_size_bytes: asset.fileSizeBytes,
      status: "stored",
      metadata: {},
      created_by: asset.createdBy ?? null,
    })),
  );

  throwIfSupabaseError(error, "insertRecipeSourceMediaAssets failed");
}
