import Image from "next/image";

import type { RecipeSourceImagePreview } from "@/modules/media-assets/use-cases/list-recipe-source-image-preview-urls";

interface RecipeSourcePhotoThumbnailsProps {
  previews: RecipeSourceImagePreview[];
}

/**
 * Recipe photos stay in Supabase Storage; `src` is a freshly signed URL (short TTL). No separate
 * thumbnail files: Next.js scales the original for display (`sizes` + fixed layout).
 */
export function RecipeSourcePhotoThumbnails({
  previews,
}: RecipeSourcePhotoThumbnailsProps) {
  if (previews.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Recipe source photos">
      {previews.map((preview) => (
        <li
          key={preview.id}
          className="relative h-24 w-24 overflow-hidden rounded-md border bg-muted"
        >
          <Image
            alt={preview.alt}
            className="object-cover"
            fill
            sizes="96px"
            src={preview.src}
            unoptimized
          />
        </li>
      ))}
    </ul>
  );
}
