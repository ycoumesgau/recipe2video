"use client";

import type { DragEvent } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AssemblySegmentClip } from "@/modules/assembly/assembly.types";
import { groupCatalogueByStoryboardPosition } from "@/modules/assembly/segment-variant-catalogue";
import { BIN_DRAG_MIME } from "@/modules/assembly/ui/timeline-editor";

/**
 * Horizontal "media bin" of available Seedance segments. Each column is a
 * storyboard slot (`S1`, `S2`, …); when several generations exist for that
 * slot, variant cards stack vertically. The accepted variant is emphasised.
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
  const columnMinHeight = Math.max(56, maxVariants * 52);

  return (
    <div
      className={cn(
        "flex items-end gap-2 overflow-x-auto rounded-md border bg-muted/20 p-2",
        className,
      )}
      role="list"
      aria-label="Segment bin"
    >
      <span className="shrink-0 self-center px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        Bin
      </span>
      {groups.map((group) => (
        <div
          className="flex shrink-0 flex-col justify-end gap-1"
          key={group.storyboardPosition}
          role="listitem"
          style={{ minHeight: columnMinHeight }}
        >
          {group.variants.map((segment) => (
            <BinCard
              key={segment.mediaAssetId}
              onAppend={onAppend}
              segment={segment}
              stretch={group.variants.length === 1}
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
  stretch,
}: {
  onAppend: (mediaAssetId: string) => void;
  segment: AssemblySegmentClip;
  /** Single-variant columns grow to fill the bin row height. */
  stretch: boolean;
}) {
  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(BIN_DRAG_MIME, segment.mediaAssetId);
    event.dataTransfer.effectAllowed = "copy";
  };
  const showVariantBadge = segment.variantCountAtPosition > 1;
  return (
    <div
      aria-label={`Drag ${segment.title} onto the timeline`}
      className={cn(
        "group/bin flex cursor-grab items-center gap-2 rounded-md border px-2 py-1 active:cursor-grabbing",
        segment.isActiveVariant
          ? "border-blue-600/50 bg-blue-600/25"
          : "border-blue-500/25 bg-blue-500/10 opacity-90",
        stretch && "min-h-[52px] flex-1",
      )}
      draggable
      onDragStart={handleDragStart}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded text-[10px] font-semibold uppercase tracking-wider",
          segment.isActiveVariant
            ? "bg-blue-600/40 text-foreground"
            : "bg-blue-500/20 text-foreground/80",
        )}
      >
        S{segment.storyboardPosition}
      </div>
      <div className="min-w-0 flex-1">
        {showVariantBadge ? (
          <div
            className={cn(
              "truncate text-[10px] font-medium uppercase tracking-wide",
              segment.isActiveVariant
                ? "text-foreground"
                : "text-foreground/65",
            )}
          >
            {segment.variantLabel}
          </div>
        ) : null}
        <div
          className={cn(
            "truncate text-[11px] font-medium",
            segment.isActiveVariant ? "text-foreground" : "text-foreground/75",
          )}
        >
          {segment.title}
        </div>
        <div className="truncate text-[10px] tabular-nums text-foreground/70">
          {segment.durationSeconds.toFixed(1)}s
        </div>
      </div>
      <Button
        aria-label={`Append ${segment.title} to the end of the timeline`}
        className="opacity-70 transition-opacity group-hover/bin:opacity-100"
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
