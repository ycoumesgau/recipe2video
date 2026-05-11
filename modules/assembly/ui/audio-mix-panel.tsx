"use client";

import type { AssemblySegmentClip } from "@/modules/assembly/assembly.types";

/**
 * Sidebar section listing every video placement on the timeline with a
 * volume slider per clip. Used in both the production assembly workspace
 * and the demo route, so it lives in a dedicated file.
 *
 * Per Q-A in the placements plan, fine-grained audio mixing is achieved
 * through (a) per-placement volume here and (b) the existing split tool —
 * to dim a single zone of a clip, the user splits it and lowers the
 * sub-placement's volume independently.
 */
export function VideoClipMixSection({
  onChange,
  segments,
}: {
  onChange: (next: AssemblySegmentClip[]) => void;
  segments: AssemblySegmentClip[];
}) {
  if (segments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
        No video clips on the timeline yet — drop a card from the bin to
        start mixing.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Video clips
        </span>
        <button
          className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() =>
            onChange(segments.map((segment) => ({ ...segment, volume: 1 })))
          }
          type="button"
        >
          Reset all to 100%
        </button>
      </div>
      {segments.map((segment) => (
        <div
          className="rounded-md border bg-muted/10 p-2 text-xs"
          key={segment.placementId}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate font-medium">{segment.title}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {Math.round((segment.volume ?? 1) * 100)}%
            </span>
          </div>
          <input
            aria-label={`Volume for ${segment.title}`}
            className="w-full accent-blue-500"
            max={2}
            min={0}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) {
                return;
              }
              onChange(
                segments.map((existing) =>
                  existing.placementId === segment.placementId
                    ? { ...existing, volume: next }
                    : existing,
                ),
              );
            }}
            step={0.05}
            type="range"
            value={segment.volume ?? 1}
          />
        </div>
      ))}
    </div>
  );
}
