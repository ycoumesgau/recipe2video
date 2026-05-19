"use client";

import { Expand, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ReferenceCardPreview({
  alt,
  className,
  onExpand,
  previewUrl,
}: {
  alt: string;
  className?: string;
  onExpand?: () => void;
  previewUrl: string | null | undefined;
}) {
  if (!previewUrl) {
    return (
      <div
        className={cn(
          "mx-3 flex h-40 items-center justify-center rounded-lg border border-dashed bg-muted/40",
          className,
        )}
      >
        <ImageIcon className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("group/preview relative mx-3", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={alt}
        className="h-40 w-full rounded-lg object-cover"
        src={previewUrl}
      />
      {onExpand ? (
        <Button
          aria-label="Ouvrir l'image en grand"
          className="absolute top-2 right-2 h-8 w-8 bg-background/95 shadow-sm"
          onClick={onExpand}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <Expand className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
