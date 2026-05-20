"use client";

import type { ReactNode } from "react";
import { Expand, ImageIcon, VideoIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { ArtifactRunwayProgress } from "./artifact-runway-progress";

/**
 * Generic image-artifact card shell shared by recipe-specific reference
 * images (References tab) and streaming-publication artifacts (Cover &
 * Canvas tab). Provides the consistent layout (preview + status badge +
 * Runway progress + slot content + action row) so the two domains do
 * not drift visually as they evolve.
 *
 * The shell is intentionally a thin layout component. Every concrete
 * card composes its own:
 *   * prompt editor section,
 *   * conditioning anchors panel,
 *   * variants compare panel,
 *   * action buttons (generate / approve / reject / upload / download),
 *
 * The references card refactor onto this shell is scheduled for the
 * polish PR — for now both consumers exist side by side. The shared
 * status-to-badge variant map below is the canonical version.
 */
export type ArtifactStatusValue =
  | "planned"
  | "generating"
  | "generated"
  | "approved"
  | "rejected"
  | "uploaded_to_runway"
  | "failed";

export const ARTIFACT_STATUS_BADGE_VARIANT: Record<
  ArtifactStatusValue,
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

/** Matches reference cards (`h-40`) so album covers stay compact in the grid. */
export const ARTIFACT_IMAGE_PREVIEW_MAX_HEIGHT_CLASS = "max-h-40";

/** Slightly taller cap for 9:16 Canvas loops while keeping the card scannable. */
export const ARTIFACT_VIDEO_PREVIEW_MAX_HEIGHT_CLASS = "max-h-56";

export function ArtifactImageCard({
  title,
  subtitle,
  status,
  badges,
  previewUrl,
  previewVideoUrl,
  previewAlt,
  aspectRatioClassName,
  runwayProgress,
  runwayTaskStatus,
  isGenerating,
  onExpandPreview,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  status: ArtifactStatusValue;
  badges?: ReactNode;
  previewUrl?: string | null;
  /** When set, renders a muted looping video in the preview slot (Canvas). */
  previewVideoUrl?: string | null;
  previewAlt: string;
  /**
   * Optional aspect-ratio hint on the media (`aspect-square`, `aspect-[9/16]`).
   * Height is always capped — see {@link ARTIFACT_IMAGE_PREVIEW_MAX_HEIGHT_CLASS}.
   */
  aspectRatioClassName?: string;
  runwayProgress?: number | null;
  runwayTaskStatus?: string | null;
  isGenerating?: boolean;
  onExpandPreview?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card size="sm">
      <ArtifactImagePreview
        alt={previewAlt}
        aspectRatioClassName={aspectRatioClassName}
        onExpand={onExpandPreview}
        previewUrl={previewUrl}
        previewVideoUrl={previewVideoUrl}
      />
      <CardHeader>
        <CardAction className="flex items-center gap-2">
          {badges}
          <Badge variant={ARTIFACT_STATUS_BADGE_VARIANT[status]}>{status}</Badge>
        </CardAction>
        <CardTitle className="pr-28">{title}</CardTitle>
        {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {isGenerating ? (
          <ArtifactRunwayProgress
            runwayProgress={runwayProgress ?? null}
            runwayTaskStatus={runwayTaskStatus ?? null}
          />
        ) : null}
        {children}
        {footer}
      </CardContent>
    </Card>
  );
}

export function ArtifactImagePreview({
  alt,
  aspectRatioClassName,
  className,
  onExpand,
  previewUrl,
  previewVideoUrl,
}: {
  alt: string;
  aspectRatioClassName?: string;
  className?: string;
  onExpand?: () => void;
  previewUrl?: string | null;
  previewVideoUrl?: string | null;
}) {
  if (previewVideoUrl) {
    return (
      <div
        className={cn(
          "mx-3 flex justify-center overflow-hidden rounded-lg border bg-black",
          className,
        )}
      >
        <video
          autoPlay
          className={cn(
            "w-auto max-w-full object-contain",
            ARTIFACT_VIDEO_PREVIEW_MAX_HEIGHT_CLASS,
            aspectRatioClassName ?? "aspect-[9/16]",
          )}
          loop
          muted
          playsInline
          src={previewVideoUrl}
        >
          <track default kind="captions" srcLang="en" />
        </video>
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div
        className={cn(
          "mx-3 flex h-40 items-center justify-center rounded-lg border border-dashed bg-muted/40",
          className,
        )}
      >
        {aspectRatioClassName?.includes("9/16") ? (
          <VideoIcon className="h-8 w-8 text-muted-foreground" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <div className={cn("group/preview relative mx-3 flex justify-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={alt}
        className={cn(
          "w-auto max-w-full rounded-lg object-contain",
          ARTIFACT_IMAGE_PREVIEW_MAX_HEIGHT_CLASS,
          aspectRatioClassName,
        )}
        src={previewUrl}
      />
      {onExpand ? (
        <Button
          aria-label="Open the preview in a larger view"
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
