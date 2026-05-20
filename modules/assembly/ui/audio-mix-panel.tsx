"use client";

import type { AssemblySegmentClip } from "@/modules/assembly/assembly.types";
import {
  clampPlacementPlaybackRate,
  getPlacementTimelineDurationSeconds,
} from "@/modules/assembly/timeline-state";

/**
 * Sidebar section listing every video placement on the timeline with a
 * volume slider (audio) and playback-rate slider (speed) per clip, in two
 * columns. Used in both the production assembly workspace and the demo route.
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
      <ClipListHeader onChange={onChange} segments={segments} />
      <div className="grid grid-cols-2 gap-x-3 px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Audio</span>
        <span>Speed</span>
      </div>
      {segments.map((segment) => (
        <ClipMixRow
          key={segment.placementId}
          onChange={onChange}
          segment={segment}
          segments={segments}
        />
      ))}
    </div>
  );
}

function ClipListHeader({
  onChange,
  segments,
}: {
  onChange: (next: AssemblySegmentClip[]) => void;
  segments: AssemblySegmentClip[];
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Video clips
      </span>
      <button
        className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
        onClick={() =>
          onChange(
            segments.map((segment) => ({
              ...segment,
              volume: 1,
              playbackRate: 1,
            })),
          )
        }
        type="button"
      >
        Reset all to 100%
      </button>
    </div>
  );
}

function ClipMixRow({
  onChange,
  segment,
  segments,
}: {
  onChange: (next: AssemblySegmentClip[]) => void;
  segment: AssemblySegmentClip;
  segments: AssemblySegmentClip[];
}) {
  const volume = segment.volume ?? 1;
  const playbackRate = clampPlacementPlaybackRate(segment.playbackRate ?? 1);
  const timelineSeconds = getPlacementTimelineDurationSeconds(segment);

  return (
    <div className="rounded-md border bg-muted/10 p-2 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate font-medium">{segment.title}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {timelineSeconds.toFixed(1)}s
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div className="space-y-0.5">
          <div className="flex justify-end tabular-nums text-muted-foreground">
            {Math.round(volume * 100)}%
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
            value={volume}
          />
        </div>
        <div className="space-y-0.5">
          <SpeedPercentLabel playbackRate={playbackRate} />
          <input
            aria-label={`Speed for ${segment.title}`}
            className="w-full accent-violet-500"
            max={4}
            min={0.25}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) {
                return;
              }
              onChange(
                segments.map((existing) =>
                  existing.placementId === segment.placementId
                    ? {
                        ...existing,
                        playbackRate: clampPlacementPlaybackRate(next),
                      }
                    : existing,
                ),
              );
            }}
            step={0.05}
            type="range"
            value={playbackRate}
          />
        </div>
      </div>
    </div>
  );
}

function SpeedPercentLabel({ playbackRate }: { playbackRate: number }) {
  return (
    <div className="flex justify-end tabular-nums text-muted-foreground">
      {Math.round(playbackRate * 100)}%
    </div>
  );
}
