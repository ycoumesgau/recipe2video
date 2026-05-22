"use client";

import { useCallback, useMemo, useState } from "react";

import type {
  ReferenceAssetReviewItem,
  ReferenceSubstitutePickerOption,
} from "../reference.types";
import { ReferenceCard } from "./reference-card";
import {
  ReferenceImageLightbox,
  type ReferenceLightboxSlide,
} from "./reference-image-lightbox";

function buildSlides(items: ReferenceAssetReviewItem[]): ReferenceLightboxSlide[] {
  return items
    .filter((item): item is ReferenceAssetReviewItem & { previewUrl: string } =>
      Boolean(item.previewUrl),
    )
    .map((item) => ({
      id: item.reference.id,
      previewUrl: item.previewUrl,
      canonicalName: item.reference.canonicalName,
      type: item.reference.type,
      status: item.reference.status,
      usedInSegments: item.usedInSegments,
      storageStatus: item.mediaAsset?.storagePath
        ? (item.mediaAsset.status ?? "stored")
        : "missing storage",
      runwayStatus: item.isLibraryGlobal
        ? "signed URL just-in-time"
        : item.reference.runwayUri
          ? "runway URI stored"
          : "not uploaded",
      prompt: item.reference.prompt,
    }));
}

export function ReferenceSectionGrid({
  items,
  substitutePickerOptions = [],
  videoId,
}: {
  items: ReferenceAssetReviewItem[];
  substitutePickerOptions?: ReferenceSubstitutePickerOption[];
  videoId: string;
}) {
  const slides = useMemo(() => buildSlides(items), [items]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const openAt = useCallback(
    (referenceId: string) => {
      const slideIndex = slides.findIndex((slide) => slide.id === referenceId);
      if (slideIndex < 0) {
        return;
      }
      setIndex(slideIndex);
      setOpen(true);
    },
    [slides],
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <ReferenceCard
            key={item.reference.id}
            item={item}
            onExpandPreview={
              item.previewUrl ? () => openAt(item.reference.id) : undefined
            }
            substitutePickerOptions={substitutePickerOptions}
            videoId={videoId}
          />
        ))}
      </div>
      <ReferenceImageLightbox
        index={index}
        items={items}
        onIndexChange={setIndex}
        onOpenChange={setOpen}
        open={open}
        slides={slides}
        videoId={videoId}
      />
    </>
  );
}
