"use client";

import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ReferenceStatus } from "../reference-status";

export type ReferenceLightboxSlide = {
  id: string;
  previewUrl: string;
  canonicalName: string;
  type: string;
  status: ReferenceStatus;
  usedInSegments: string[];
  storageStatus: string;
  runwayStatus: string;
  prompt?: string | null;
};

const statusBadgeVariant: Record<
  ReferenceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  planned: "outline",
  generating: "default",
  generated: "secondary",
  approved: "default",
  rejected: "destructive",
  uploaded_to_runway: "secondary",
  failed: "destructive",
};

export function ReferenceImageLightbox({
  index,
  onIndexChange,
  onOpenChange,
  open,
  slides,
}: {
  index: number;
  onIndexChange: (index: number) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  slides: ReferenceLightboxSlide[];
}) {
  const slide = slides[index] ?? null;
  const hasMultiple = slides.length > 1;

  const goPrev = useCallback(() => {
    if (slides.length === 0) {
      return;
    }
    onIndexChange((index - 1 + slides.length) % slides.length);
  }, [index, onIndexChange, slides.length]);

  const goNext = useCallback(() => {
    if (slides.length === 0) {
      return;
    }
    onIndexChange((index + 1) % slides.length);
  }, [index, onIndexChange, slides.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, open]);

  useEffect(() => {
    if (index >= slides.length && slides.length > 0) {
      onIndexChange(0);
    }
  }, [index, onIndexChange, slides.length]);

  if (!slide) {
    return null;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[min(96vh,900px)] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{slide.canonicalName}</DialogTitle>
          <DialogDescription>
            Aperçu de la référence {slide.type}
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/95 px-12 py-6">
          {hasMultiple ? (
            <Button
              aria-label="Image précédente"
              className="absolute top-1/2 left-2 z-10 -translate-y-1/2"
              onClick={goPrev}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          ) : null}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={slide.canonicalName}
            className="max-h-[min(72vh,720px)] w-auto max-w-full object-contain"
            src={slide.previewUrl}
          />

          {hasMultiple ? (
            <Button
              aria-label="Image suivante"
              className="absolute top-1/2 right-2 z-10 -translate-y-1/2"
              onClick={goNext}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : null}

          {hasMultiple ? (
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground">
              {index + 1} / {slides.length}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 border-t bg-popover p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="truncate font-heading text-base font-medium">
                {slide.canonicalName}
              </p>
              <p className="text-sm text-muted-foreground">{slide.type}</p>
            </div>
            <Badge variant={statusBadgeVariant[slide.status]}>
              {slide.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <LightboxMetric label="Storage" value={slide.storageStatus} />
            <LightboxMetric label="Runway" value={slide.runwayStatus} />
          </div>

          {slide.usedInSegments.length > 0 ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs">
              <p className="font-medium">Used in segments</p>
              <p className="mt-1 text-muted-foreground">
                {slide.usedInSegments.join(", ")}
              </p>
            </div>
          ) : null}

          {slide.prompt ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs">
              <p className="font-medium">Prompt</p>
              <p className="mt-1 line-clamp-4 text-muted-foreground">
                {slide.prompt}
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LightboxMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
