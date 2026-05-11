import type { MediaAsset } from "./media-asset.types";

/** Recipe-source row that should be treated as an image (overview + Cursor vision). */
export function isRecipeSourceImageFile(asset: MediaAsset): boolean {
  const mime = asset.mimeType?.toLowerCase().trim();
  if (mime && mime.startsWith("image/")) {
    return true;
  }

  const name = asset.originalFilename ?? "";
  return /\.(jpe?g|png|webp)$/i.test(name);
}
