"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ARTIFACT_STATUS_BADGE_VARIANT } from "@/modules/shared/ui/artifact-image-card";

import type { ReferenceAssetReviewItem } from "../reference.types";
import type { ReferenceStatus } from "../reference-status";
import { ReferenceCardActions } from "./reference-card-actions";

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

export function ReferenceImageLightbox({
  index,
  items,
  onIndexChange,
  onOpenChange,
  open,
  slides,
  videoId,
}: {
  index: number;
  items: ReferenceAssetReviewItem[];
  onIndexChange: (index: number) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  slides: ReferenceLightboxSlide[];
  videoId: string;
}) {
  const slide = slides[index] ?? null;
  const currentItem =
    slide === null
      ? null
      : (items.find((item) => item.reference.id === slide.id) ?? null);
  const hasMultiple = slides.length > 1;
  const isGenerating = currentItem?.reference.status === "generating";

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
        className="flex max-h-[96vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{slide.canonicalName}</DialogTitle>
          <DialogDescription>
            Aperçu de la référence {slide.type}
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-[min(52vh,520px)] shrink-0 bg-black/95">
          <div className="grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-4">
            {hasMultiple ? (
              <LightboxNavButton
                aria-label="Image précédente"
                onClick={goPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </LightboxNavButton>
            ) : (
              <div aria-hidden className="size-8 shrink-0" />
            )}

            <div className="flex h-full min-h-0 min-w-0 items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={slide.canonicalName}
                className="pointer-events-none max-h-full max-w-full object-contain"
                src={slide.previewUrl}
              />
            </div>

            {hasMultiple ? (
              <LightboxNavButton
                aria-label="Image suivante"
                onClick={goNext}
              >
                <ChevronRight className="h-4 w-4" />
              </LightboxNavButton>
            ) : (
              <div aria-hidden className="size-8 shrink-0" />
            )}
          </div>

          {hasMultiple ? (
            <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground">
              {index + 1} / {slides.length}
            </p>
          ) : null}
        </div>

        <div className="min-h-0 shrink space-y-3 overflow-y-auto border-t bg-popover p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="truncate font-heading text-base font-medium">
                {slide.canonicalName}
              </p>
              <p className="text-sm text-muted-foreground">{slide.type}</p>
            </div>
            <Badge variant={ARTIFACT_STATUS_BADGE_VARIANT[slide.status]}>
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

          {isGenerating && currentItem ? (
            <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium">Runway progress</p>
              <Progress
                value={progressForRecipeReferenceCard(
                  currentItem.reference.runwayProgress ?? null,
                  currentItem.reference.runwayTaskStatus ?? null,
                )}
              />
              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {currentItem.reference.runwayTaskStatus ?? "starting"}
                </span>
                {typeof currentItem.reference.runwayProgress === "number" ? (
                  <span>
                    {currentItem.reference.runwayProgress.toFixed(0)}%
                  </span>
                ) : (
                  <span>queued / running</span>
                )}
              </div>
            </div>
          ) : null}

          {currentItem ? (
            <ReferenceCardActions item={currentItem} videoId={videoId} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LightboxNavButton({
  children,
  onClick,
  ...props
}: {
  children: ReactNode;
  onClick: () => void;
} & Omit<React.ComponentProps<typeof Button>, "onClick" | "size" | "variant">) {
  return (
    <Button
      className="relative z-20 shrink-0"
      onClick={onClick}
      size="icon-sm"
      type="button"
      variant="outline"
      {...props}
    >
      {children}
    </Button>
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

function progressForRecipeReferenceCard(
  runwayProgress: number | null,
  runwayTaskStatus: string | null,
): number {
  if (typeof runwayProgress === "number") {
    return Math.max(0, Math.min(100, runwayProgress));
  }
  if (runwayTaskStatus === "RUNNING") {
    return 55;
  }
  if (runwayTaskStatus === "THROTTLED") {
    return 18;
  }
  if (runwayTaskStatus === "PENDING") {
    return 25;
  }
  return 15;
}
