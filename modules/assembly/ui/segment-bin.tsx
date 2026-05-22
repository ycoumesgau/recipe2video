"use client";

import type { DragEvent } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AssemblySegmentClip } from "@/modules/assembly/assembly.types";
import { groupCatalogueByStoryboardPosition } from "@/modules/assembly/segment-variant-catalogue";
import {
  segmentVariantClipClasses,
  segmentVariantClipShellClass,
} from "@/modules/assembly/ui/segment-clip-appearance";
import { BIN_DRAG_MIME } from "@/modules/assembly/ui/timeline-editor";

/** Minimum height per variant row when the bin stacks several takes. */
const VARIANT_ROW_MIN_PX = 48;
const BIN_VERTICAL_PADDING_PX = 16;

/**
 * Horizontal "media bin" of available Seedance segments. Each column is a
 * storyboard slot (`S1`, `S2`, …); when several generations exist for that
 * slot, variant cards stack vertically and share the column height evenly.
 */
export function SegmentBin({
  availableSegments,
  className,
  onAppend,
}: {
  availableSegments: AssemblySegmentClip[];
  className?: string;
  onAppend: (mediaAssetId: string) => void;
}) {
  const groups = groupCatalogueByStoryboardPosition(availableSegments);

  if (groups.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground",
          className,
        )}
      >
        No accepted Supabase-stored segments yet — accept a segment variant
        in the storyboard step before assembling the timeline.
      </div>
    );
  }

  const maxVariants = groups.reduce(
    (max, group) => Math.max(max, group.variants.length),
    1,
  );
  const binRowHeight =
    maxVariants * VARIANT_ROW_MIN_PX +
    Math.max(0, maxVariants - 1) * 4 +
    BIN_VERTICAL_PADDING_PX;

  return (
    <div
      className={cn(
        "flex items-stretch gap-2 overflow-x-auto rounded-md border bg-muted/20 p-2",
        className,
      )}
      role="list"
      aria-label="Segment bin"
      style={{ minHeight: binRowHeight }}
    >
      <span className="shrink-0 self-center px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        Bin
      </span>
      {groups.map((group) => (
        <div
          className="flex min-h-0 shrink-0 flex-col gap-1"
          key={group.storyboardPosition}
          role="listitem"
          style={{ minHeight: binRowHeight - BIN_VERTICAL_PADDING_PX }}
        >
          {group.variants.map((segment) => (
            <BinCard
              key={segment.mediaAssetId}
              onAppend={onAppend}
              segment={segment}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function BinCard({
  onAppend,
  segment,
}: {
  onAppend: (mediaAssetId: string) => void;
  segment: AssemblySegmentClip;
}) {
  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(BIN_DRAG_MIME, segment.mediaAssetId);
    event.dataTransfer.effectAllowed = "copy";
  };
  const showVariantBadge = segment.variantCountAtPosition > 1;
  const appearance = segmentVariantClipClasses(segment.isActiveVariant);

  return (
    <div
      aria-label={`Drag ${segment.title} onto the timeline`}
      className={cn(
        "group/bin flex min-h-[48px] flex-1 cursor-grab items-center gap-2 rounded-md border px-2 py-1 active:cursor-grabbing",
        segmentVariantClipShellClass(segment.isActiveVariant),
        !segment.isActiveVariant && "opacity-90",
      )}
      draggable
      onDragStart={handleDragStart}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded text-[10px] font-semibold uppercase tracking-wider",
          appearance.badge,
        )}
      >
        S{segment.storyboardPosition}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
        {showVariantBadge ? (
          <div
            className={cn(
              "truncate text-[10px] font-medium uppercase tracking-wide",
              appearance.variantLabel,
            )}
          >
            {segment.variantLabel}
          </div>
        ) : null}
        <div className={cn("truncate text-[11px] font-medium", appearance.title)}>
          {segment.title}
        </div>
        <div className="truncate text-[10px] tabular-nums text-foreground/70">
          {segment.durationSeconds.toFixed(1)}s
        </div>
      </div>
      <Button
        aria-label={`Append ${segment.title} to the end of the timeline`}
        className="shrink-0 opacity-70 transition-opacity group-hover/bin:opacity-100"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAppend(segment.mediaAssetId);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
