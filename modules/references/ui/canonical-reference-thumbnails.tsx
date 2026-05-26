"use client";

import { Film, ImageIcon } from "lucide-react";

import type { ConditioningAnchorPreview } from "../reference.types";

function isVideoItem(item: ConditioningAnchorPreview): boolean {
  return item.kind === "video";
}

export function CanonicalReferenceThumbnails({
  items,
}: {
  items: ConditioningAnchorPreview[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div
          key={`${item.source}-${item.canonicalName}`}
          className="rounded-md border bg-background/40 p-1 text-[10px]"
        >
          {item.previewUrl ? (
            isVideoItem(item) ? (
              <video
                className="aspect-square w-full rounded object-cover"
                muted
                playsInline
                preload="metadata"
                src={item.previewUrl}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={item.tag}
                className="aspect-square w-full rounded object-cover"
                src={item.previewUrl}
              />
            )
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded bg-muted/40">
              {isVideoItem(item) ? (
                <Film className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          )}
          <p className="mt-1 truncate font-medium" title={item.tag}>
            @{item.tag}
          </p>
          <p
            className="truncate text-muted-foreground"
            title={item.category}
          >
            {item.source === "reference_assets"
              ? `recipe · ${item.category}`
              : item.category}
          </p>
        </div>
      ))}
    </div>
  );
}
