"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pause,
  Play,
  Scissors,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PlayerRef } from "@remotion/player";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  AssemblyAudioClip,
  AssemblyAudioTrack,
  AssemblySegmentClip,
} from "@/modules/assembly/assembly.types";

import { AudioClipWaveform } from "./audio-clip-waveform";

/**
 * Optional pre-computed waveform peaks keyed by audio mediaAssetId. Used by
 * the demo route to render a non-flat waveform without depending on
 * cross-origin audio. The production page does not pass this map, so
 * wavesurfer fetches and decodes audio from the Supabase signed URL.
 */
type PeaksByMediaAsset = Record<string, number[] | Float32Array>;

const TRACK_RULER_HEIGHT = 28;
const VIDEO_TRACK_HEIGHT = 84;
const AUDIO_TRACK_HEIGHT = 84;
const TIMELINE_HEIGHT =
  TRACK_RULER_HEIGHT + VIDEO_TRACK_HEIGHT + AUDIO_TRACK_HEIGHT + 8;
const TRIM_HANDLE_WIDTH = 14;
const SNAP_TOLERANCE_PX = 6;
const MIN_CLIP_DURATION = 0.2;

type DragMode =
  | { kind: "idle" }
  | {
      kind: "segment-move";
      placementId: string;
      pointerId: number;
      startX: number;
      originalIndex: number;
    }
  | {
      kind: "segment-trim";
      placementId: string;
      side: "left" | "right";
      pointerId: number;
      startX: number;
      initialInSeconds: number;
      initialOutSeconds: number;
    }
  | {
      kind: "audio-move";
      clipId: string;
      pointerId: number;
      startX: number;
      initialStart: number;
    }
  | {
      kind: "audio-trim";
      clipId: string;
      side: "left" | "right";
      pointerId: number;
      startX: number;
      initialInSeconds: number;
      initialOutSeconds: number;
      initialStart: number;
    }
  | {
      kind: "audio-fade";
      clipId: string;
      side: "in" | "out";
      pointerId: number;
      startX: number;
      initialFade: number;
    }
  | {
      kind: "playhead";
      pointerId: number;
    };

/**
 * Proposed-but-not-yet-committed drag state. Rendered as a translucent
 * overlay (ghost) so the clip itself stays at its committed geometry until
 * the user releases the pointer. This matches the trim UX of CapCut /
 * Premiere / DaVinci where the clip width does not change while dragging an
 * edge — only a visual indicator moves.
 *
 * Reorder (`segment-move`) is intentionally NOT deferred: clips snapping into
 * their new slot during the drag is the expected feedback for reorder and
 * was not flagged as a UX problem.
 */
type PendingDrag =
  | null
  | {
      kind: "segment-trim";
      placementId: string;
      side: "left" | "right";
      nextInSeconds: number;
      nextOutSeconds: number;
    }
  | {
      kind: "audio-trim";
      clipId: string;
      side: "left" | "right";
      nextInSeconds: number;
      nextOutSeconds: number;
      nextStart: number;
    }
  | {
      kind: "audio-move";
      clipId: string;
      nextStart: number;
    }
  | {
      kind: "audio-fade";
      clipId: string;
      side: "in" | "out";
      nextFade: number;
    };

export interface TimelineEditorProps {
  audioTrack: AssemblyAudioTrack | null;
  audioClips: AssemblyAudioClip[];
  fps: number;
  onAudioClipsChange: (clips: AssemblyAudioClip[]) => void;
  onSegmentsChange: (segments: AssemblySegmentClip[]) => void;
  /**
   * Optional pre-computed peaks for audio waveform rendering. Indexed by
   * `AssemblyAudioTrack.mediaAssetId`. Mostly used by the demo route.
   */
  peaksByMediaAsset?: PeaksByMediaAsset;
  playerRef: React.RefObject<PlayerRef | null>;
  segments: AssemblySegmentClip[];
}

export function TimelineEditor({
  audioTrack,
  audioClips,
  fps,
  onAudioClipsChange,
  onSegmentsChange,
  peaksByMediaAsset,
  playerRef,
  segments,
}: TimelineEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tracksRef = useRef<HTMLDivElement | null>(null);
  const dragModeRef = useRef<DragMode>({ kind: "idle" });
  const [pxPerSecond, setPxPerSecond] = useState(60);
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selection, setSelection] = useState<
    | { kind: "segment"; placementId: string }
    | { kind: "audio"; clipId: string }
    | null
  >(null);
  const [pendingDrag, setPendingDrag] = useState<PendingDrag>(null);

  const segmentLayout = useMemo(() => {
    const result: Array<{ startSeconds: number; durationSeconds: number }> = [];
    let cursor = 0;
    for (const segment of segments) {
      const trimmed = Math.max(segment.outSeconds - segment.inSeconds, 0);
      result.push({ startSeconds: cursor, durationSeconds: trimmed });
      cursor += trimmed;
    }
    return result;
  }, [segments]);
  const totalSegmentSeconds = segmentLayout.reduce(
    (max, layout) => Math.max(max, layout.startSeconds + layout.durationSeconds),
    0,
  );
  const totalAudioSeconds = audioClips.reduce((max, clip) => {
    const duration = Math.max(clip.outSeconds - clip.inSeconds, 0);
    return Math.max(max, clip.startOnTimelineSeconds + duration);
  }, 0);
  const totalSeconds = Math.max(totalSegmentSeconds, totalAudioSeconds, 1);
  const timelineSeconds = Math.max(totalSeconds + 4, 12);
  const timelineWidthPx = timelineSeconds * pxPerSecond;
  const playheadSeconds = playheadFrame / fps;

  // Subscribe to the Remotion Player so the playhead stays in sync while
  // playback runs and after manual seeks elsewhere in the UI.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    const handleFrame = (event: { detail: { frame: number } }) => {
      setPlayheadFrame(event.detail.frame);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    player.addEventListener("frameupdate", handleFrame);
    player.addEventListener("play", handlePlay);
    player.addEventListener("pause", handlePause);
    setPlayheadFrame(player.getCurrentFrame());

    return () => {
      player.removeEventListener("frameupdate", handleFrame);
      player.removeEventListener("play", handlePlay);
      player.removeEventListener("pause", handlePause);
    };
  }, [playerRef]);

  const seekTo = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, Math.min(seconds, timelineSeconds));
      const targetFrame = Math.round(clamped * fps);
      playerRef.current?.seekTo(targetFrame);
      setPlayheadFrame(targetFrame);
    },
    [fps, playerRef, timelineSeconds],
  );

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    if (player.isPlaying()) {
      player.pause();
    } else {
      player.play();
    }
  }, [playerRef]);

  // Snap targets: every clip boundary plus the playhead, used both for video
  // moves and audio drag/trim.
  const snapTargets = useMemo(() => {
    const targets = new Set<number>();
    targets.add(0);
    targets.add(playheadSeconds);
    segmentLayout.forEach((layout) => {
      targets.add(layout.startSeconds);
      targets.add(layout.startSeconds + layout.durationSeconds);
    });
    audioClips.forEach((clip) => {
      const duration = Math.max(clip.outSeconds - clip.inSeconds, 0);
      targets.add(clip.startOnTimelineSeconds);
      targets.add(clip.startOnTimelineSeconds + duration);
    });
    return Array.from(targets);
  }, [audioClips, playheadSeconds, segmentLayout]);

  const snap = useCallback(
    (seconds: number, ignore?: number[]) => {
      const tolerance = SNAP_TOLERANCE_PX / pxPerSecond;
      let best = seconds;
      let bestDelta = tolerance;
      for (const target of snapTargets) {
        if (ignore?.includes(target)) {
          continue;
        }
        const delta = Math.abs(target - seconds);
        if (delta < bestDelta) {
          best = target;
          bestDelta = delta;
        }
      }
      return best;
    },
    [pxPerSecond, snapTargets],
  );

  const xToSeconds = useCallback(
    (clientX: number) => {
      const tracks = tracksRef.current;
      if (!tracks) {
        return 0;
      }
      const rect = tracks.getBoundingClientRect();
      return Math.max(0, (clientX - rect.left) / pxPerSecond);
    },
    [pxPerSecond],
  );

  const handleRulerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      dragModeRef.current = { kind: "playhead", pointerId: event.pointerId };
      seekTo(xToSeconds(event.clientX));
    },
    [seekTo, xToSeconds],
  );

  const handleRulerPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragModeRef.current;
      if (drag.kind !== "playhead" || drag.pointerId !== event.pointerId) {
        return;
      }
      seekTo(xToSeconds(event.clientX));
    },
    [seekTo, xToSeconds],
  );

  const handleRulerPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragModeRef.current;
      if (drag.kind === "playhead" && drag.pointerId === event.pointerId) {
        dragModeRef.current = { kind: "idle" };
      }
    },
    [],
  );

  const handleSegmentPointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      placementId: string,
      mode: "move" | "trim-left" | "trim-right",
    ) => {
      const segment = segments.find((s) => s.placementId === placementId);
      if (!segment) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      setSelection({ kind: "segment", placementId });
      if (mode === "move") {
        dragModeRef.current = {
          kind: "segment-move",
          placementId,
          pointerId: event.pointerId,
          startX: event.clientX,
          originalIndex: segments.findIndex(
            (s) => s.placementId === placementId,
          ),
        };
      } else {
        dragModeRef.current = {
          kind: "segment-trim",
          placementId,
          side: mode === "trim-left" ? "left" : "right",
          pointerId: event.pointerId,
          startX: event.clientX,
          initialInSeconds: segment.inSeconds,
          initialOutSeconds: segment.outSeconds,
        };
      }
    },
    [segments],
  );

  const handleAudioPointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      clipId: string,
      mode: "move" | "trim-left" | "trim-right" | "fade-in" | "fade-out",
    ) => {
      const clip = audioClips.find((c) => c.id === clipId);
      if (!clip) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      setSelection({ kind: "audio", clipId });
      if (mode === "move") {
        dragModeRef.current = {
          kind: "audio-move",
          clipId,
          pointerId: event.pointerId,
          startX: event.clientX,
          initialStart: clip.startOnTimelineSeconds,
        };
      } else if (mode === "trim-left" || mode === "trim-right") {
        dragModeRef.current = {
          kind: "audio-trim",
          clipId,
          side: mode === "trim-left" ? "left" : "right",
          pointerId: event.pointerId,
          startX: event.clientX,
          initialInSeconds: clip.inSeconds,
          initialOutSeconds: clip.outSeconds,
          initialStart: clip.startOnTimelineSeconds,
        };
      } else {
        dragModeRef.current = {
          kind: "audio-fade",
          clipId,
          side: mode === "fade-in" ? "in" : "out",
          pointerId: event.pointerId,
          startX: event.clientX,
          initialFade:
            mode === "fade-in" ? clip.fadeInSeconds : clip.fadeOutSeconds,
        };
      }
    },
    [audioClips],
  );

  // Centralised pointer-move handler on the wrapping tracks container, so a
  // fast drag that briefly leaves a clip element still updates state instead
  // of stalling.
  const handleTracksPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragModeRef.current;
      if (drag.kind === "idle" || drag.pointerId !== event.pointerId) {
        return;
      }
      // Playhead drags are owned by the ruler, not the tracks lane.
      if (drag.kind === "playhead") {
        return;
      }
      const deltaX = event.clientX - drag.startX;
      const deltaSeconds = deltaX / pxPerSecond;

      if (drag.kind === "segment-trim") {
        const segment = segments.find(
          (s) => s.placementId === drag.placementId,
        );
        if (!segment) {
          return;
        }
        let nextInSeconds = drag.initialInSeconds;
        let nextOutSeconds = drag.initialOutSeconds;
        if (drag.side === "left") {
          nextInSeconds = clamp(
            drag.initialInSeconds + deltaSeconds,
            0,
            drag.initialOutSeconds - MIN_CLIP_DURATION,
          );
        } else {
          nextOutSeconds = clamp(
            drag.initialOutSeconds + deltaSeconds,
            drag.initialInSeconds + MIN_CLIP_DURATION,
            segment.durationSeconds,
          );
        }
        // Defer commit to pointerup so neighbours don't reflow during drag.
        setPendingDrag({
          kind: "segment-trim",
          placementId: drag.placementId,
          side: drag.side,
          nextInSeconds,
          nextOutSeconds,
        });
      } else if (drag.kind === "segment-move") {
        const draggedIdx = segments.findIndex(
          (s) => s.placementId === drag.placementId,
        );
        if (draggedIdx === -1) {
          return;
        }
        const draggedLayout = segmentLayout[draggedIdx];
        if (!draggedLayout) {
          return;
        }
        const visualCenter =
          draggedLayout.startSeconds +
          draggedLayout.durationSeconds / 2 +
          deltaSeconds;

        // Find the new index by checking which slot the visual center falls
        // into, treating each segment as occupying [start, start+duration).
        let newIndex = segmentLayout.findIndex((layout, idx) => {
          if (idx === draggedIdx) {
            return false;
          }
          const center = layout.startSeconds + layout.durationSeconds / 2;
          return visualCenter < center;
        });
        if (newIndex === -1) {
          newIndex = segments.length - 1;
        }

        if (newIndex !== draggedIdx) {
          const next = [...segments];
          const [moved] = next.splice(draggedIdx, 1);
          if (moved) {
            next.splice(newIndex, 0, moved);
            onSegmentsChange(next);
          }
          dragModeRef.current = {
            ...drag,
            startX: event.clientX,
            originalIndex: newIndex,
          };
        }
      } else if (drag.kind === "audio-move") {
        const nextStart = Math.max(
          snap(drag.initialStart + deltaSeconds, [drag.initialStart]),
          0,
        );
        setPendingDrag({ kind: "audio-move", clipId: drag.clipId, nextStart });
      } else if (drag.kind === "audio-trim") {
        let nextInSeconds = drag.initialInSeconds;
        let nextOutSeconds = drag.initialOutSeconds;
        let nextStart = drag.initialStart;
        if (drag.side === "left") {
          // Trim left = pull or push the in-point AND shift the timeline
          // start by the same amount, like a typical NLE.
          nextInSeconds = clamp(
            drag.initialInSeconds + deltaSeconds,
            0,
            drag.initialOutSeconds - MIN_CLIP_DURATION,
          );
          nextStart = Math.max(
            drag.initialStart + (nextInSeconds - drag.initialInSeconds),
            0,
          );
        } else {
          nextOutSeconds = Math.max(
            drag.initialOutSeconds + deltaSeconds,
            drag.initialInSeconds + MIN_CLIP_DURATION,
          );
        }
        setPendingDrag({
          kind: "audio-trim",
          clipId: drag.clipId,
          side: drag.side,
          nextInSeconds,
          nextOutSeconds,
          nextStart,
        });
      } else if (drag.kind === "audio-fade") {
        const clip = audioClips.find((c) => c.id === drag.clipId);
        if (!clip) {
          return;
        }
        const totalLength = Math.max(
          clip.outSeconds - clip.inSeconds,
          MIN_CLIP_DURATION,
        );
        let nextFade = drag.initialFade;
        if (drag.side === "in") {
          nextFade = clamp(
            drag.initialFade + deltaSeconds,
            0,
            Math.max(totalLength - clip.fadeOutSeconds, 0),
          );
        } else {
          // Fade-out handle pulls leftward.
          nextFade = clamp(
            drag.initialFade - deltaSeconds,
            0,
            Math.max(totalLength - clip.fadeInSeconds, 0),
          );
        }
        setPendingDrag({
          kind: "audio-fade",
          clipId: drag.clipId,
          side: drag.side,
          nextFade,
        });
      }
    },
    [audioClips, onSegmentsChange, pxPerSecond, segmentLayout, segments, snap],
  );

  const commitPendingDrag = useCallback(
    (pending: PendingDrag) => {
      if (!pending) {
        return;
      }
      if (pending.kind === "segment-trim") {
        onSegmentsChange(
          segments.map((segment) =>
            segment.placementId === pending.placementId
              ? {
                  ...segment,
                  inSeconds: pending.nextInSeconds,
                  outSeconds: pending.nextOutSeconds,
                }
              : segment,
          ),
        );
      } else if (pending.kind === "audio-move") {
        onAudioClipsChange(
          audioClips.map((clip) =>
            clip.id === pending.clipId
              ? { ...clip, startOnTimelineSeconds: pending.nextStart }
              : clip,
          ),
        );
      } else if (pending.kind === "audio-trim") {
        onAudioClipsChange(
          audioClips.map((clip) =>
            clip.id === pending.clipId
              ? {
                  ...clip,
                  inSeconds: pending.nextInSeconds,
                  outSeconds: pending.nextOutSeconds,
                  startOnTimelineSeconds: pending.nextStart,
                }
              : clip,
          ),
        );
      } else if (pending.kind === "audio-fade") {
        onAudioClipsChange(
          audioClips.map((clip) => {
            if (clip.id !== pending.clipId) {
              return clip;
            }
            return pending.side === "in"
              ? { ...clip, fadeInSeconds: pending.nextFade }
              : { ...clip, fadeOutSeconds: pending.nextFade };
          }),
        );
      }
    },
    [audioClips, onAudioClipsChange, onSegmentsChange, segments],
  );

  const handleTracksPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragModeRef.current;
      if (drag.kind !== "idle" && drag.pointerId === event.pointerId) {
        dragModeRef.current = { kind: "idle" };
        // Capture the latest pending value off the React state via a
        // functional setter so we always commit the freshest preview.
        setPendingDrag((current) => {
          commitPendingDrag(current);
          return null;
        });
      }
    },
    [commitPendingDrag],
  );

  const handleSplitAtPlayhead = useCallback(() => {
    if (!selection || selection.kind !== "audio") {
      return;
    }
    const clip = audioClips.find((c) => c.id === selection.clipId);
    if (!clip) {
      return;
    }
    const playheadOffset = playheadSeconds - clip.startOnTimelineSeconds;
    if (
      playheadOffset <= MIN_CLIP_DURATION ||
      playheadOffset >= clip.outSeconds - clip.inSeconds - MIN_CLIP_DURATION
    ) {
      return;
    }
    const splitInSource = clip.inSeconds + playheadOffset;
    const left: AssemblyAudioClip = {
      ...clip,
      outSeconds: splitInSource,
      fadeOutSeconds: 0,
    };
    const right: AssemblyAudioClip = {
      ...clip,
      id: `${clip.id}_${Math.floor(Math.random() * 1e6)}`,
      inSeconds: splitInSource,
      startOnTimelineSeconds: clip.startOnTimelineSeconds + playheadOffset,
      fadeInSeconds: 0,
    };
    onAudioClipsChange(
      audioClips.flatMap((existing) =>
        existing.id === clip.id ? [left, right] : [existing],
      ),
    );
  }, [audioClips, onAudioClipsChange, playheadSeconds, selection]);

  const handleDeleteSelected = useCallback(() => {
    if (!selection) {
      return;
    }
    if (selection.kind === "audio") {
      onAudioClipsChange(
        audioClips.filter((clip) => clip.id !== selection.clipId),
      );
      setSelection(null);
    }
  }, [audioClips, onAudioClipsChange, selection]);

  // Keyboard shortcuts: space toggles play/pause, S splits the selected audio
  // clip at the playhead, Delete/Backspace removes the selected audio clip.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!containerRef.current?.contains(document.activeElement)) {
        // Only activate shortcuts when the timeline is focused-or-hovered.
        if (!containerRef.current?.matches(":hover")) {
          return;
        }
      }
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        handleSplitAtPlayhead();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        handleDeleteSelected();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDeleteSelected, handleSplitAtPlayhead, togglePlay]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl border bg-card text-sm shadow-sm"
      tabIndex={0}
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button
          onClick={togglePlay}
          size="sm"
          type="button"
          variant="outline"
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatTime(playheadSeconds)} / {formatTime(totalSeconds)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            disabled={selection?.kind !== "audio"}
            onClick={handleSplitAtPlayhead}
            size="sm"
            type="button"
            variant="outline"
          >
            <Scissors className="h-3.5 w-3.5" />
            Split (S)
          </Button>
          <Button
            disabled={selection?.kind !== "audio"}
            onClick={handleDeleteSelected}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Zoom out"
              onClick={() =>
                setPxPerSecond((current) => clamp(current * 0.75, 12, 320))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(pxPerSecond)} px/s
            </span>
            <Button
              aria-label="Zoom in"
              onClick={() =>
                setPxPerSecond((current) => clamp(current * 1.33, 12, 320))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div
        className="overflow-x-auto overflow-y-hidden"
        style={{ height: TIMELINE_HEIGHT + 16 }}
      >
        <div
          className="relative select-none"
          style={{ minWidth: timelineWidthPx, height: TIMELINE_HEIGHT }}
        >
          <TimeRuler
            onPointerDown={handleRulerPointerDown}
            onPointerMove={handleRulerPointerMove}
            onPointerUp={handleRulerPointerUp}
            pxPerSecond={pxPerSecond}
            totalSeconds={timelineSeconds}
            widthPx={timelineWidthPx}
          />
          <div
            ref={tracksRef}
            className="relative"
            onPointerMove={handleTracksPointerMove}
            onPointerUp={handleTracksPointerUp}
            onPointerCancel={handleTracksPointerUp}
            style={{
              height: VIDEO_TRACK_HEIGHT + AUDIO_TRACK_HEIGHT + 8,
              width: timelineWidthPx,
            }}
          >
            <TrackLane
              label="Video"
              top={0}
              height={VIDEO_TRACK_HEIGHT}
              widthPx={timelineWidthPx}
            >
              {segments.map((segment, index) => {
                const layout = segmentLayout[index];
                if (!layout) {
                  return null;
                }
                const widthPx = Math.max(
                  layout.durationSeconds * pxPerSecond,
                  MIN_CLIP_DURATION * pxPerSecond,
                );
                const leftPx = layout.startSeconds * pxPerSecond;
                const isSelected =
                  selection?.kind === "segment" &&
                  selection.placementId === segment.placementId;
                return (
                  <SegmentClipBox
                    isSelected={isSelected}
                    key={segment.placementId}
                    leftPx={leftPx}
                    onPointerDown={(event, mode) =>
                      handleSegmentPointerDown(
                        event,
                        segment.placementId,
                        mode,
                      )
                    }
                    segment={segment}
                    widthPx={widthPx}
                  />
                );
              })}
            </TrackLane>

            <TrackLane
              label="Audio"
              top={VIDEO_TRACK_HEIGHT + 8}
              height={AUDIO_TRACK_HEIGHT}
              widthPx={timelineWidthPx}
            >
              {audioTrack && audioClips.length === 0 ? (
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                  Audio attached but no clip on the timeline. Click + to drop it.
                </div>
              ) : null}
              {audioTrack
                ? audioClips.map((clip) => {
                    const widthPx = Math.max(
                      (clip.outSeconds - clip.inSeconds) * pxPerSecond,
                      MIN_CLIP_DURATION * pxPerSecond,
                    );
                    const leftPx = clip.startOnTimelineSeconds * pxPerSecond;
                    const isSelected =
                      selection?.kind === "audio" &&
                      selection.clipId === clip.id;
                    return (
                      <AudioClipBox
                        audioTrack={audioTrack}
                        clip={clip}
                        isSelected={isSelected}
                        key={clip.id}
                        leftPx={leftPx}
                        onPointerDown={(event, mode) =>
                          handleAudioPointerDown(event, clip.id, mode)
                        }
                        peaks={peaksByMediaAsset?.[audioTrack.mediaAssetId]}
                        pxPerSecond={pxPerSecond}
                        widthPx={widthPx}
                      />
                    );
                  })
                : null}
            </TrackLane>

            <DragGhost
              audioClips={audioClips}
              audioTrackHeight={AUDIO_TRACK_HEIGHT}
              audioTrackTop={VIDEO_TRACK_HEIGHT + 8}
              pendingDrag={pendingDrag}
              pxPerSecond={pxPerSecond}
              segmentLayout={segmentLayout}
              segments={segments}
              videoTrackHeight={VIDEO_TRACK_HEIGHT}
            />
          </div>

          <Playhead
            heightPx={VIDEO_TRACK_HEIGHT + AUDIO_TRACK_HEIGHT + 8}
            leftPx={playheadSeconds * pxPerSecond}
            topPx={TRACK_RULER_HEIGHT}
          />
        </div>
      </div>
      <ShortcutsLegend selection={selection} />
    </div>
  );
}

function ShortcutsLegend({
  selection,
}: {
  selection: { kind: "segment" | "audio" } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
      <span>
        <kbd className="rounded border bg-muted px-1">Space</kbd> play/pause
      </span>
      <span>
        <kbd className="rounded border bg-muted px-1">S</kbd> split selected
        audio at playhead
      </span>
      <span>
        <kbd className="rounded border bg-muted px-1">Del</kbd> remove
        selected audio
      </span>
      <span>Drag clip body to move, edges to trim, top corners to fade.</span>
      <span className="ml-auto">
        Selection: {selection?.kind ?? "none"}
      </span>
    </div>
  );
}

function TimeRuler({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  pxPerSecond,
  totalSeconds,
  widthPx,
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  pxPerSecond: number;
  totalSeconds: number;
  widthPx: number;
}) {
  // Pick a major tick step so labels stay readable at any zoom level.
  const minLabelPx = 60;
  const candidates = [0.5, 1, 2, 5, 10, 30, 60, 120, 300];
  const majorStep =
    candidates.find((step) => step * pxPerSecond >= minLabelPx) ?? 600;
  const ticks: number[] = [];
  for (let t = 0; t <= totalSeconds + 0.001; t += majorStep) {
    ticks.push(Number(t.toFixed(3)));
  }
  return (
    <div
      className="relative cursor-col-resize border-b bg-muted/40"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ height: TRACK_RULER_HEIGHT, width: widthPx }}
    >
      {ticks.map((seconds) => (
        <div
          className="absolute top-0 flex h-full items-center"
          key={seconds}
          style={{ left: seconds * pxPerSecond, transform: "translateX(0)" }}
        >
          <div className="h-3 w-px bg-border" />
          <span className="ml-1 select-none text-[10px] tabular-nums text-muted-foreground">
            {formatTime(seconds)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrackLane({
  children,
  height,
  label,
  top,
  widthPx,
}: {
  children: React.ReactNode;
  height: number;
  label: string;
  top: number;
  widthPx: number;
}) {
  return (
    <div
      className="absolute rounded-md border bg-muted/20"
      style={{ height, left: 0, top, width: widthPx }}
    >
      <div className="absolute left-1 top-1 z-10 rounded bg-background/80 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function SegmentClipBox({
  isSelected,
  leftPx,
  onPointerDown,
  segment,
  widthPx,
}: {
  isSelected: boolean;
  leftPx: number;
  onPointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    mode: "move" | "trim-left" | "trim-right",
  ) => void;
  segment: AssemblySegmentClip;
  widthPx: number;
}) {
  const trimmedDuration = Math.max(segment.outSeconds - segment.inSeconds, 0);
  return (
    <div
      className={cn(
        "absolute top-1 flex h-[calc(100%-8px)] cursor-grab items-stretch rounded-md border border-blue-500/40 bg-blue-500/30 transition-shadow",
        isSelected &&
          "border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.55)]",
      )}
      onPointerDown={(event) => onPointerDown(event, "move")}
      style={{ left: leftPx, width: widthPx } satisfies CSSProperties}
    >
      <TrimHandle
        onPointerDown={(event) => onPointerDown(event, "trim-left")}
        side="left"
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between px-2 py-1 text-[11px] text-foreground">
        <div className="truncate font-medium">{segment.title}</div>
        <div className="truncate tabular-nums text-foreground/70">
          {trimmedDuration.toFixed(1)}s · in {segment.inSeconds.toFixed(1)}s ·
          out {segment.outSeconds.toFixed(1)}s
        </div>
      </div>
      <TrimHandle
        onPointerDown={(event) => onPointerDown(event, "trim-right")}
        side="right"
      />
    </div>
  );
}

function AudioClipBox({
  audioTrack,
  clip,
  isSelected,
  leftPx,
  onPointerDown,
  peaks,
  pxPerSecond,
  widthPx,
}: {
  audioTrack: AssemblyAudioTrack;
  clip: AssemblyAudioClip;
  isSelected: boolean;
  leftPx: number;
  onPointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    mode: "move" | "trim-left" | "trim-right" | "fade-in" | "fade-out",
  ) => void;
  peaks?: number[] | Float32Array;
  pxPerSecond: number;
  widthPx: number;
}) {
  const trimmedDuration = Math.max(clip.outSeconds - clip.inSeconds, 0);
  const fadeInWidth = Math.min(
    clip.fadeInSeconds * pxPerSecond,
    widthPx - 8,
  );
  const fadeOutWidth = Math.min(
    clip.fadeOutSeconds * pxPerSecond,
    widthPx - 8,
  );
  return (
    <div
      className={cn(
        "absolute top-1 flex h-[calc(100%-8px)] cursor-grab items-stretch overflow-hidden rounded-md border border-rose-500/40 bg-rose-500/25",
        isSelected &&
          "border-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.55)]",
      )}
      onPointerDown={(event) => onPointerDown(event, "move")}
      style={{ left: leftPx, width: widthPx } satisfies CSSProperties}
    >
      <AudioClipWaveform
        durationSeconds={audioTrack.durationSeconds ?? clip.outSeconds}
        inSeconds={clip.inSeconds}
        outSeconds={clip.outSeconds}
        peaks={peaks}
        pxPerSecond={pxPerSecond}
        sourceUrl={audioTrack.sourceUrl}
      />
      <TrimHandle
        onPointerDown={(event) => onPointerDown(event, "trim-left")}
        side="left"
      />
      <div className="relative flex min-w-0 flex-1 flex-col justify-between px-2 py-1 text-[11px] text-foreground">
        <div className="truncate font-medium">{audioTrack.title}</div>
        <div className="truncate tabular-nums text-foreground/70">
          {trimmedDuration.toFixed(1)}s · vol {Math.round(clip.volume * 100)}%
        </div>
      </div>
      <TrimHandle
        onPointerDown={(event) => onPointerDown(event, "trim-right")}
        side="right"
      />
      <FadeHandle
        onPointerDown={(event) => onPointerDown(event, "fade-in")}
        side="left"
        widthPx={fadeInWidth}
      />
      <FadeHandle
        onPointerDown={(event) => onPointerDown(event, "fade-out")}
        side="right"
        widthPx={fadeOutWidth}
      />
    </div>
  );
}

function TrimHandle({
  onPointerDown,
  side,
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  side: "left" | "right";
}) {
  return (
    <div
      aria-label={side === "left" ? "Trim start" : "Trim end"}
      className={cn(
        "z-20 flex shrink-0 cursor-ew-resize items-center justify-center bg-foreground/20 transition-colors hover:bg-foreground/40",
        side === "left" ? "rounded-l-md" : "ml-auto rounded-r-md",
      )}
      onPointerDown={onPointerDown}
      style={{ width: TRIM_HANDLE_WIDTH }}
    >
      <div className="h-5 w-0.5 bg-foreground/80" />
    </div>
  );
}

function FadeHandle({
  onPointerDown,
  side,
  widthPx,
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  side: "left" | "right";
  widthPx: number;
}) {
  // Always render a small grabber so the user can initiate a fade by
  // dragging from the corner, even when no fade is set yet. When the fade is
  // already non-zero, render a wider gradient strip so the visual extent of
  // the fade is obvious.
  const gripHandleWidth = 16;
  return (
    <>
      {widthPx > 1 ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 h-full",
            side === "left" ? "left-0" : "right-0",
          )}
          style={{
            background:
              side === "left"
                ? "linear-gradient(to right, rgba(0,0,0,0.55), rgba(0,0,0,0))"
                : "linear-gradient(to left, rgba(0,0,0,0.55), rgba(0,0,0,0))",
            width: widthPx,
          }}
        />
      ) : null}
      <div
        aria-label={side === "left" ? "Fade in" : "Fade out"}
        className={cn(
          "pointer-events-auto absolute top-0 z-10 h-3 cursor-pointer rounded-sm bg-foreground/70 transition-colors hover:bg-foreground",
          side === "left" ? "left-1" : "right-1",
        )}
        onPointerDown={onPointerDown}
        style={{ width: gripHandleWidth, height: 10 }}
        title={side === "left" ? "Drag to fade in" : "Drag to fade out"}
      />
    </>
  );
}

function Playhead({
  heightPx,
  leftPx,
  topPx,
}: {
  heightPx: number;
  leftPx: number;
  topPx: number;
}) {
  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{ height: heightPx, left: leftPx, top: topPx }}
    >
      <div className="absolute -left-[5px] -top-[5px] h-2.5 w-2.5 rotate-45 bg-rose-500" />
      <div className="h-full w-px bg-rose-500" />
    </div>
  );
}

/**
 * Renders the deferred-commit drag preview. The committed clip stays at its
 * persisted geometry; this overlay shows where the change will land once the
 * user releases the pointer, plus a small label with the magnitude of the
 * delta in seconds. Only renders when a deferred drag is active.
 */
function DragGhost({
  audioClips,
  audioTrackHeight,
  audioTrackTop,
  pendingDrag,
  pxPerSecond,
  segmentLayout,
  segments,
  videoTrackHeight,
}: {
  audioClips: AssemblyAudioClip[];
  audioTrackHeight: number;
  audioTrackTop: number;
  pendingDrag: PendingDrag;
  pxPerSecond: number;
  segmentLayout: Array<{ startSeconds: number; durationSeconds: number }>;
  segments: AssemblySegmentClip[];
  videoTrackHeight: number;
}) {
  if (!pendingDrag) {
    return null;
  }

  if (pendingDrag.kind === "segment-trim") {
    const idx = segments.findIndex(
      (segment) => segment.placementId === pendingDrag.placementId,
    );
    const segment = segments[idx];
    const layout = segmentLayout[idx];
    if (!segment || !layout) {
      return null;
    }
    const deltaSeconds =
      pendingDrag.side === "left"
        ? pendingDrag.nextInSeconds - segment.inSeconds
        : pendingDrag.nextOutSeconds - segment.outSeconds;
    const newEdgeOffsetSeconds =
      pendingDrag.side === "left"
        ? pendingDrag.nextInSeconds - segment.inSeconds
        : layout.durationSeconds +
          (pendingDrag.nextOutSeconds - segment.outSeconds);
    const ghostX = (layout.startSeconds + newEdgeOffsetSeconds) * pxPerSecond;
    const originalEdgeX =
      pendingDrag.side === "left"
        ? layout.startSeconds * pxPerSecond
        : (layout.startSeconds + layout.durationSeconds) * pxPerSecond;
    return (
      <GhostBoundary
        deltaSeconds={deltaSeconds}
        ghostX={ghostX}
        originalEdgeX={originalEdgeX}
        topPx={0}
        heightPx={videoTrackHeight}
      />
    );
  }

  if (pendingDrag.kind === "audio-trim") {
    const clip = audioClips.find((c) => c.id === pendingDrag.clipId);
    if (!clip) {
      return null;
    }
    const originalLeftX = clip.startOnTimelineSeconds * pxPerSecond;
    const originalRightX =
      (clip.startOnTimelineSeconds + (clip.outSeconds - clip.inSeconds)) *
      pxPerSecond;
    const ghostX =
      pendingDrag.side === "left"
        ? pendingDrag.nextStart * pxPerSecond
        : (pendingDrag.nextStart +
            (pendingDrag.nextOutSeconds - pendingDrag.nextInSeconds)) *
          pxPerSecond;
    const originalEdgeX =
      pendingDrag.side === "left" ? originalLeftX : originalRightX;
    const deltaSeconds =
      pendingDrag.side === "left"
        ? pendingDrag.nextInSeconds - clip.inSeconds
        : pendingDrag.nextOutSeconds - clip.outSeconds;
    return (
      <GhostBoundary
        deltaSeconds={deltaSeconds}
        ghostX={ghostX}
        originalEdgeX={originalEdgeX}
        topPx={audioTrackTop}
        heightPx={audioTrackHeight}
      />
    );
  }

  if (pendingDrag.kind === "audio-move") {
    const clip = audioClips.find((c) => c.id === pendingDrag.clipId);
    if (!clip) {
      return null;
    }
    const widthPx = (clip.outSeconds - clip.inSeconds) * pxPerSecond;
    const ghostX = pendingDrag.nextStart * pxPerSecond;
    const deltaSeconds = pendingDrag.nextStart - clip.startOnTimelineSeconds;
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute z-30"
        style={{
          height: audioTrackHeight - 2,
          left: ghostX,
          top: audioTrackTop + 1,
          width: Math.max(widthPx, 1),
        }}
      >
        <div className="h-full w-full rounded-md border-2 border-dashed border-rose-400 bg-rose-400/10" />
        <DeltaLabel
          deltaSeconds={deltaSeconds}
          leftPx={Math.min(widthPx / 2, 60)}
          topPx={-22}
        />
      </div>
    );
  }

  if (pendingDrag.kind === "audio-fade") {
    const clip = audioClips.find((c) => c.id === pendingDrag.clipId);
    if (!clip) {
      return null;
    }
    const leftEdgePx = clip.startOnTimelineSeconds * pxPerSecond;
    const widthPx = (clip.outSeconds - clip.inSeconds) * pxPerSecond;
    const rightEdgePx = leftEdgePx + widthPx;
    const ghostX =
      pendingDrag.side === "in"
        ? leftEdgePx + pendingDrag.nextFade * pxPerSecond
        : rightEdgePx - pendingDrag.nextFade * pxPerSecond;
    const originalEdgeX =
      pendingDrag.side === "in"
        ? leftEdgePx + clip.fadeInSeconds * pxPerSecond
        : rightEdgePx - clip.fadeOutSeconds * pxPerSecond;
    const deltaSeconds =
      pendingDrag.nextFade -
      (pendingDrag.side === "in" ? clip.fadeInSeconds : clip.fadeOutSeconds);
    return (
      <GhostBoundary
        deltaSeconds={deltaSeconds}
        ghostX={ghostX}
        originalEdgeX={originalEdgeX}
        topPx={audioTrackTop}
        heightPx={audioTrackHeight}
      />
    );
  }

  return null;
}

function GhostBoundary({
  deltaSeconds,
  ghostX,
  heightPx,
  originalEdgeX,
  topPx,
}: {
  deltaSeconds: number;
  ghostX: number;
  heightPx: number;
  originalEdgeX: number;
  topPx: number;
}) {
  const leftPx = Math.min(ghostX, originalEdgeX);
  const widthPx = Math.max(Math.abs(ghostX - originalEdgeX), 1);
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute z-30 bg-foreground/15"
        style={{
          height: heightPx,
          left: leftPx,
          top: topPx,
          width: widthPx,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute z-30 w-px bg-foreground"
        style={{ height: heightPx, left: ghostX, top: topPx }}
      />
      <DeltaLabel deltaSeconds={deltaSeconds} leftPx={ghostX + 4} topPx={topPx + 4} />
    </>
  );
}

function DeltaLabel({
  deltaSeconds,
  leftPx,
  topPx,
}: {
  deltaSeconds: number;
  leftPx: number;
  topPx: number;
}) {
  const sign = deltaSeconds > 0 ? "+" : deltaSeconds < 0 ? "−" : "±";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-30 rounded-sm bg-foreground px-1 text-[10px] tabular-nums text-background shadow-sm"
      style={{ left: leftPx, top: topPx }}
    >
      {sign}
      {Math.abs(deltaSeconds).toFixed(2)}s
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatTime(seconds: number) {
  const safe = Math.max(seconds, 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  const wholeSec = Math.floor(remainder);
  const frac = Math.round((remainder - wholeSec) * 10);
  return `${minutes.toString().padStart(2, "0")}:${wholeSec
    .toString()
    .padStart(2, "0")}.${frac}`;
}

export function AddAudioClipButton({
  audioClips,
  audioTrack,
  onChange,
}: {
  audioClips: AssemblyAudioClip[];
  audioTrack: AssemblyAudioTrack | null;
  onChange: (next: AssemblyAudioClip[]) => void;
}) {
  if (!audioTrack || audioClips.length > 0) {
    return null;
  }
  const handleAdd = () => {
    onChange([
      {
        id: `audio_${Math.floor(Math.random() * 1e6)}`,
        mediaAssetId: audioTrack.mediaAssetId,
        startOnTimelineSeconds: 0,
        inSeconds: 0,
        outSeconds: Math.max(audioTrack.durationSeconds ?? 30, 0.5),
        volume: 1,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
      },
    ]);
  };
  return (
    <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs">
      <Label className="mb-1 block text-xs">Drop audio on the timeline</Label>
      <Button onClick={handleAdd} size="sm" type="button" variant="outline">
        Add Suno track to timeline
      </Button>
    </div>
  );
}
