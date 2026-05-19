import { LICORN_OUTRO_REFERENCE_NAMES } from "@/modules/storyboard/services/seedance-outro-template";

export type ProjectCardThumbnailPick =
  | { kind: "media"; mediaAssetId: string }
  | { kind: "mux"; playbackId: string }
  | null;

export interface ProjectCardThumbnailReferenceRow {
  canonicalName: string;
  mediaAssetId: string | null;
  createdAt: string;
}

/**
 * Chooses which asset should back a library / home project card thumbnail.
 *
 * Priority (recipe-specific imagery before generated clip frames):
 *   1. `FinalDishVisual` reference (finished dish)
 *   2. Any other recipe-specific reference with stored image media
 *   3. Uploaded `recipe_source` photos (first image in upload order)
 *   4. Mux thumbnail from the first accepted clip with playback
 */
export function pickProjectCardThumbnail(input: {
  references: ProjectCardThumbnailReferenceRow[];
  recipeSourceImageAssetIds: string[];
  muxPlaybackId: string | null;
}): ProjectCardThumbnailPick {
  const finalDish = input.references.find(
    (row) =>
      isFinalDishVisualCanonicalName(row.canonicalName) &&
      row.mediaAssetId,
  );
  if (finalDish?.mediaAssetId) {
    return { kind: "media", mediaAssetId: finalDish.mediaAssetId };
  }

  const otherReference = input.references.find(
    (row) =>
      row.mediaAssetId &&
      !isFinalDishVisualCanonicalName(row.canonicalName),
  );
  if (otherReference?.mediaAssetId) {
    return { kind: "media", mediaAssetId: otherReference.mediaAssetId };
  }

  const firstRecipePhotoId = input.recipeSourceImageAssetIds[0];
  if (firstRecipePhotoId) {
    return { kind: "media", mediaAssetId: firstRecipePhotoId };
  }

  if (input.muxPlaybackId) {
    return { kind: "mux", playbackId: input.muxPlaybackId };
  }

  return null;
}

export function isFinalDishVisualCanonicalName(canonicalName: string): boolean {
  return (
    canonicalName.trim().toLowerCase() ===
    LICORN_OUTRO_REFERENCE_NAMES.finalDishVisual.toLowerCase()
  );
}
