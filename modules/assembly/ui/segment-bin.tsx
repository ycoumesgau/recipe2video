"use client";

import type { DragEvent } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AssemblySegmentClip } from "@/modules/assembly/assembly.types";
import { BIN_DRAG_MIME } from "@/modules/assembly/ui/timeline-editor";

/**
 * Horizontal "media bin" of available Seedance segments. Each card is
 * draggable (HTML5 drag-and-drop) and carries the segment's id via the
 * {@link BIN_DRAG_MIME} mime type. Drop it on the video lane in
 * {@link TimelineEditor} to add a new placement at that position.
 *
 * The same segment stays in the bin even after it has been placed — users
 * can drop it as many times as they want (resolution Q3 in
 * `docs/assembly-segment-placements-plan.md`).
 *
 * The "+" button on each card is the keyboard / no-drag fallback: it
 * appends the segment to the end of the timeline.
 */
export function SegmentBin({
  availableSegments,
  className,
  onAppend,
}: {
  availableSegments: AssemblySegmentClip[];
  className?: string;
  onAppend: (segmentId: string) => void;
}) {
  if (availableSegments.length === 0) {
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

  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-x-auto rounded-md border bg-muted/20 p-2",
        className,
      )}
      role="list"
      aria-label="Segment bin"
    >
      <span className="shrink-0 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        Bin
      </span>
      {/*
        Dedupe by segmentId — the catalogue from `get-assembly-data` is
        already unique per segmentId, but the UI card list should be safe
        even if a future caller passes a list with duplicates.
      */}
      {dedupeBySegmentId(availableSegments).map((segment) => (
        <BinCard key={segment.segmentId} onAppend={onAppend} segment={segment} />
      ))}
    </div>
  );
}

function BinCard({
  onAppend,
  segment,
}: {
  onAppend: (segmentId: string) => void;
  segment: AssemblySegmentClip;
}) {
  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    // Use a custom mime so a user dragging selected text from elsewhere on
    // the page cannot accidentally trigger an "add a placement" action.
    event.dataTransfer.setData(BIN_DRAG_MIME, segment.segmentId);
    event.dataTransfer.effectAllowed = "copy";
  };
  return (
    <div
      aria-label={`Drag ${segment.title} onto the timeline`}
      className="group/bin flex shrink-0 cursor-grab items-center gap-2 rounded-md border border-blue-500/40 bg-blue-500/15 px-2 py-1 active:cursor-grabbing"
      draggable
      onDragStart={handleDragStart}
      role="listitem"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-500/30 text-[10px] font-semibold uppercase tracking-wider text-foreground">
        {segment.title.slice(0, 2)}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium text-foreground">
          {segment.title}
        </div>
        <div className="truncate text-[10px] tabular-nums text-foreground/70">
          {segment.durationSeconds.toFixed(1)}s
        </div>
      </div>
      <Button
        aria-label={`Append ${segment.title} to the end of the timeline`}
        className="opacity-70 transition-opacity group-hover/bin:opacity-100"
        // The parent div has `draggable`, which on Chrome intercepts the
        // mousedown that would otherwise fire a click on the button. Stop
        // the mousedown from reaching the parent so the button stays
        // clickable while the rest of the card stays draggable.
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAppend(segment.segmentId);
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

function dedupeBySegmentId(
  segments: AssemblySegmentClip[],
): AssemblySegmentClip[] {
  const seen = new Set<string>();
  const result: AssemblySegmentClip[] = [];
  for (const segment of segments) {
    if (seen.has(segment.segmentId)) {
      continue;
    }
    seen.add(segment.segmentId);
    result.push(segment);
  }
  return result;
}
