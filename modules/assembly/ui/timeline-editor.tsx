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
import { getPlacementTimelineDurationSeconds } from "@/modules/assembly/timeline-state";

import {
  computeDropInsertIndex,
  computeReorderInsertIndex,
  generatePlacementId,
  splitPlacementAtSourceSeconds,
} from "@/modules/assembly/timeline-state";

import { AudioClipWaveform } from "./audio-clip-waveform";
import {
  segmentVariantClipClasses,
  segmentVariantClipShellClass,
  segmentVariantSelectionRingClass,
} from "./segment-clip-appearance";

/**
 * MIME-style key used by the segment bin (HTML5 drag-and-drop) to ferry the
 * dragged {@link AssemblySegmentClip.mediaAssetId} from a bin card to the
 * video track's drop target. We intentionally use a non-`text/plain` key so
 * a stray drag of selected text can never be misinterpreted as a bin drop.
 */
export const BIN_DRAG_MIME = "application/x-recipe2video-segment-asset";

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
const SNAP_TOLERANCE_PX = 10;
const MIN_CLIP_DURATION = 0.2;

/**
 * Categorisation of the snap-target sources, used to colour the snap
 * indicator differently depending on what the audio is sticking to.
 *
 * - `video-start` : timeline 0 that also happens to be the first video
 *   clip's leading edge. Visually treated like a video boundary.
 * - `video-boundary` : start or end of any video clip on the timeline.
 *   This is the main case the user asked for ("audio s'accroche au
 *   début / la fin d'une plage vidéo").
 * - `audio-boundary` : start or end of another audio clip on the
 *   timeline (excluding the one being dragged).
 * - `playhead` : current Remotion playhead position.
 * - `origin` : timeline 0 when no video clip is there.
 */
type SnapTargetKind =
  | "video-start"
  | "video-boundary"
  | "audio-boundary"
  | "playhead"
  | "origin";

interface SnapTarget {
  seconds: number;
  kind: SnapTargetKind;
}

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
      kind: "segment-move";
      placementId: string;
      /**
       * Index this clip will end up at when the drag is committed. This
       * index is interpreted in the array AFTER the dragged clip has been
       * removed (so it is in `[0, segments.length - 1]`).
       */
      newIndex: number;
      /**
       * Px position of the green insertion line, relative to the tracks
       * container. Same coordinate system as {@link Playhead.leftPx}.
       */
      indicatorX: number;
      /**
       * Px translation of the dragged clip while the drag is in progress,
       * so the user sees the clip follow the cursor. Reset to 0 on commit.
       */
      translateX: number;
    }
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
   * Fired when a segment card from the bin is dropped onto the video track.
   * The editor itself does not own the segment catalogue, so it cannot
   * materialise the new placement on its own — the parent looks up the
   * `mediaAssetId` in `availableSegments` and pushes a new clip into
   * `segments` at the requested index.
   */
  onSegmentDroppedFromBin?: (input: {
    mediaAssetId: string;
    insertIndex: number;
  }) => void;
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
  onSegmentDroppedFromBin,
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
  /**
   * Visible insertion marker while a segment card from the bin is being
   * dragged over the video lane (HTML5 drag-and-drop). Holds the px X
   * position of the proposed insertion line, or null when no bin drag is
   * in progress.
   */
  const [binDropIndicatorPx, setBinDropIndicatorPx] = useState<number | null>(
    null,
  );
  /**
   * When a drag (audio move / audio trim) snaps to a clip boundary or the
   * playhead, this holds the timeline position of the snap target so we
   * can render a thin guideline. Cleared on pointerup.
   */
  const [snapMarker, setSnapMarker] = useState<{
    seconds: number;
    kind: SnapTargetKind;
  } | null>(null);

  const segmentLayout = useMemo(() => {
    const result: Array<{ startSeconds: number; durationSeconds: number }> = [];
    let cursor = 0;
    for (const segment of segments) {
      const timelineSeconds = getPlacementTimelineDurationSeconds(segment);
      result.push({ startSeconds: cursor, durationSeconds: timelineSeconds });
      cursor += timelineSeconds;
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

  // Snap targets: every video clip boundary, every other audio clip
  // boundary, the playhead, and timeline 0. Used for audio move/trim so a
  // music clip "clicks" onto a video boundary like in CapCut / Premiere.
  const snapTargets = useMemo<SnapTarget[]>(() => {
    const targets: SnapTarget[] = [];
    const seen = new Set<string>();
    const add = (seconds: number, kind: SnapTargetKind) => {
      // Round to 4 decimals so two near-identical floats from different
      // sources don't double-stack at the same px.
      const key = `${kind}:${seconds.toFixed(4)}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      targets.push({ seconds, kind });
    };
    add(0, "origin");
    add(playheadSeconds, "playhead");
    segmentLayout.forEach((layout, index) => {
      // First clip's start coincides with origin — keep both, the kind
      // matters for the indicator color.
      add(layout.startSeconds, index === 0 ? "video-start" : "video-boundary");
      add(layout.startSeconds + layout.durationSeconds, "video-boundary");
    });
    audioClips.forEach((clip) => {
      const duration = Math.max(clip.outSeconds - clip.inSeconds, 0);
      add(clip.startOnTimelineSeconds, "audio-boundary");
      add(clip.startOnTimelineSeconds + duration, "audio-boundary");
    });
    return targets;
  }, [audioClips, playheadSeconds, segmentLayout]);

  /**
   * Try to snap a candidate timeline position (in seconds) to one of the
   * known snap targets within {@link SNAP_TOLERANCE_PX}. Returns both the
   * (possibly snapped) value and the target it landed on, so callers can
   * render a guideline. `ignoreClipId` excludes a specific audio clip's
   * boundaries from the targets — used while moving an audio clip so its
   * own edges don't snap to themselves.
   */
  const snap = useCallback(
    (
      seconds: number,
      options?: { ignoreClipId?: string },
    ): { value: number; target: SnapTarget | null } => {
      const tolerance = SNAP_TOLERANCE_PX / pxPerSecond;
      let bestTarget: SnapTarget | null = null;
      let bestDelta = tolerance;
      const ignoredAudio = options?.ignoreClipId
        ? audioClips.find((clip) => clip.id === options.ignoreClipId)
        : undefined;
      const ignoredAudioStarts = ignoredAudio
        ? new Set([
            ignoredAudio.startOnTimelineSeconds,
            ignoredAudio.startOnTimelineSeconds +
              Math.max(
                ignoredAudio.outSeconds - ignoredAudio.inSeconds,
                0,
              ),
          ])
        : null;
      for (const target of snapTargets) {
        if (
          target.kind === "audio-boundary" &&
          ignoredAudioStarts?.has(target.seconds)
        ) {
          continue;
        }
        const delta = Math.abs(target.seconds - seconds);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestTarget = target;
        }
      }
      return {
        value: bestTarget ? bestTarget.seconds : seconds,
        target: bestTarget,
      };
    },
    [audioClips, pxPerSecond, snapTargets],
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
        // Deferred commit: never mutate the segments array during the drag.
        // We only update a 'pendingDrag' state used to draw a green
        // insertion line and translate the dragged clip with the cursor.
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
        // The cursor is the source of truth for "where the user wants the
        // clip to land", not the clip's leading edge. Convert client-X to
        // a position in seconds relative to the tracks container.
        const tracks = tracksRef.current;
        const tracksLeft = tracks ? tracks.getBoundingClientRect().left : 0;
        const cursorSeconds = Math.max(
          (event.clientX - tracksLeft) / pxPerSecond,
          0,
        );
        const { newIndex, indicatorSeconds } = computeReorderInsertIndex(
          segmentLayout,
          draggedIdx,
          cursorSeconds,
        );
        setPendingDrag({
          kind: "segment-move",
          placementId: drag.placementId,
          newIndex,
          indicatorX: indicatorSeconds * pxPerSecond,
          translateX: deltaX,
        });
      } else if (drag.kind === "audio-move") {
        const clip = audioClips.find((c) => c.id === drag.clipId);
        const duration = clip
          ? Math.max(clip.outSeconds - clip.inSeconds, 0)
          : 0;
        const candidateStart = Math.max(drag.initialStart + deltaSeconds, 0);
        // Snap both the leading edge AND the trailing edge to whichever
        // target is closest, so dropping the audio with its END aligned to
        // the end of a video clip "clicks" just like the start would.
        const leadingSnap = snap(candidateStart, {
          ignoreClipId: drag.clipId,
        });
        const trailingSnap = snap(candidateStart + duration, {
          ignoreClipId: drag.clipId,
        });
        const leadingDelta = leadingSnap.target
          ? Math.abs(leadingSnap.value - candidateStart)
          : Infinity;
        const trailingDelta = trailingSnap.target
          ? Math.abs(trailingSnap.value - (candidateStart + duration))
          : Infinity;
        let nextStart = candidateStart;
        let snappedTarget: SnapTarget | null = null;
        if (leadingDelta <= trailingDelta && leadingSnap.target) {
          nextStart = leadingSnap.value;
          snappedTarget = leadingSnap.target;
        } else if (trailingSnap.target) {
          nextStart = trailingSnap.value - duration;
          snappedTarget = trailingSnap.target;
        }
        nextStart = Math.max(nextStart, 0);
        setPendingDrag({
          kind: "audio-move",
          clipId: drag.clipId,
          nextStart,
        });
        setSnapMarker(
          snappedTarget
            ? { seconds: snappedTarget.seconds, kind: snappedTarget.kind }
            : null,
        );
      } else if (drag.kind === "audio-trim") {
        let nextInSeconds = drag.initialInSeconds;
        let nextOutSeconds = drag.initialOutSeconds;
        let nextStart = drag.initialStart;
        let snappedTarget: SnapTarget | null = null;
        if (drag.side === "left") {
          // Trim left = pull or push the in-point AND shift the timeline
          // start by the same amount, like a typical NLE.
          const candidateIn = clamp(
            drag.initialInSeconds + deltaSeconds,
            0,
            drag.initialOutSeconds - MIN_CLIP_DURATION,
          );
          const candidateStart = Math.max(
            drag.initialStart + (candidateIn - drag.initialInSeconds),
            0,
          );
          // Snap the trimmed edge's TIMELINE position to clip boundaries.
          const snapResult = snap(candidateStart, {
            ignoreClipId: drag.clipId,
          });
          nextStart = snapResult.value;
          // Re-derive the in-point from the snapped start so the source
          // window stays consistent with the visual edge on the timeline.
          nextInSeconds = clamp(
            drag.initialInSeconds + (nextStart - drag.initialStart),
            0,
            drag.initialOutSeconds - MIN_CLIP_DURATION,
          );
          snappedTarget = snapResult.target;
        } else {
          const candidateOut = Math.max(
            drag.initialOutSeconds + deltaSeconds,
            drag.initialInSeconds + MIN_CLIP_DURATION,
          );
          // Right edge's TIMELINE position is start + (out - in).
          const candidateRightOnTimeline =
            drag.initialStart + (candidateOut - drag.initialInSeconds);
          const snapResult = snap(candidateRightOnTimeline, {
            ignoreClipId: drag.clipId,
          });
          nextOutSeconds = Math.max(
            drag.initialInSeconds + (snapResult.value - drag.initialStart),
            drag.initialInSeconds + MIN_CLIP_DURATION,
          );
          snappedTarget = snapResult.target;
        }
        setPendingDrag({
          kind: "audio-trim",
          clipId: drag.clipId,
          side: drag.side,
          nextInSeconds,
          nextOutSeconds,
          nextStart,
        });
        setSnapMarker(
          snappedTarget
            ? { seconds: snappedTarget.seconds, kind: snappedTarget.kind }
            : null,
        );
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
    [audioClips, pxPerSecond, segmentLayout, segments, snap],
  );

  const commitPendingDrag = useCallback(
    (pending: PendingDrag) => {
      if (!pending) {
        return;
      }
      if (pending.kind === "segment-move") {
        const draggedIdx = segments.findIndex(
          (segment) => segment.placementId === pending.placementId,
        );
        if (draggedIdx === -1) {
          return;
        }
        // pending.newIndex is in the post-splice (length n-1) array; if it
        // equals draggedIdx it would be a no-op so don't churn React.
        if (pending.newIndex === draggedIdx) {
          return;
        }
        const next = [...segments];
        const [moved] = next.splice(draggedIdx, 1);
        if (!moved) {
          return;
        }
        next.splice(pending.newIndex, 0, moved);
        onSegmentsChange(next);
      } else if (pending.kind === "segment-trim") {
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
        setSnapMarker(null);
      }
    },
    [commitPendingDrag],
  );

  const handleSplitAtPlayhead = useCallback(() => {
    if (!selection) {
      return;
    }
    if (selection.kind === "audio") {
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
      return;
    }
    // Segment split: locate the placement under the playhead and call the
    // pure helper that returns two adjacent placements sharing the same
    // segmentId. Selection moves to the right half so the user can press
    // 'S' again to chain a second split (typical 5-click middle-cut flow).
    const idx = segments.findIndex((segment) => segment.placementId === selection.placementId);
    if (idx === -1) {
      return;
    }
    const layout = segmentLayout[idx];
    const segment = segments[idx];
    if (!layout || !segment) {
      return;
    }
    const offsetIntoPlacement = playheadSeconds - layout.startSeconds;
    if (
      offsetIntoPlacement <= MIN_CLIP_DURATION ||
      offsetIntoPlacement >= layout.durationSeconds - MIN_CLIP_DURATION
    ) {
      return;
    }
    const playbackRate = segment.playbackRate ?? 1;
    const splitInSource =
      segment.inSeconds + offsetIntoPlacement * playbackRate;
    const newPlacementId = generatePlacementId();
    const result = splitPlacementAtSourceSeconds(
      segments,
      segment.placementId,
      splitInSource,
      newPlacementId,
    );
    if (!result) {
      return;
    }
    onSegmentsChange(result.next);
    setSelection({ kind: "segment", placementId: result.rightPlacementId });
  }, [
    audioClips,
    onAudioClipsChange,
    onSegmentsChange,
    playheadSeconds,
    segmentLayout,
    segments,
    selection,
  ]);

  const handleVideoLaneDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      // Only react to drags that carry our bin payload — drops of stray
      // selected text or files should not paint a drop indicator.
      if (!event.dataTransfer.types.includes(BIN_DRAG_MIME)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      const tracks = tracksRef.current;
      if (!tracks) {
        return;
      }
      const rect = tracks.getBoundingClientRect();
      const dropX = event.clientX - rect.left;
      const dropSeconds = Math.max(dropX / pxPerSecond, 0);
      const insertIndex = computeDropInsertIndex(segmentLayout, dropSeconds);
      const insertX =
        insertIndex < segmentLayout.length
          ? (segmentLayout[insertIndex]?.startSeconds ?? 0) * pxPerSecond
          : segmentLayout.reduce(
              (acc, layout) =>
                Math.max(
                  acc,
                  (layout.startSeconds + layout.durationSeconds) * pxPerSecond,
                ),
              0,
            );
      setBinDropIndicatorPx(insertX);
    },
    [pxPerSecond, segmentLayout],
  );
  const handleVideoLaneDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      // Ignore moves between the lane's children (still over the lane).
      if (
        event.currentTarget.contains(event.relatedTarget as Node | null)
      ) {
        return;
      }
      setBinDropIndicatorPx(null);
    },
    [],
  );
  const handleVideoLaneDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const mediaAssetId = event.dataTransfer.getData(BIN_DRAG_MIME);
      setBinDropIndicatorPx(null);
      if (!mediaAssetId || !onSegmentDroppedFromBin) {
        return;
      }
      event.preventDefault();
      const tracks = tracksRef.current;
      if (!tracks) {
        return;
      }
      const rect = tracks.getBoundingClientRect();
      const dropX = event.clientX - rect.left;
      const dropSeconds = Math.max(dropX / pxPerSecond, 0);
      const insertIndex = computeDropInsertIndex(segmentLayout, dropSeconds);
      onSegmentDroppedFromBin({ mediaAssetId, insertIndex });
    },
    [onSegmentDroppedFromBin, pxPerSecond, segmentLayout],
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selection) {
      return;
    }
    if (selection.kind === "audio") {
      onAudioClipsChange(
        audioClips.filter((clip) => clip.id !== selection.clipId),
      );
      setSelection(null);
      return;
    }
    onSegmentsChange(
      segments.filter(
        (segment) => segment.placementId !== selection.placementId,
      ),
    );
    setSelection(null);
  }, [
    audioClips,
    onAudioClipsChange,
    onSegmentsChange,
    segments,
    selection,
  ]);

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
            disabled={!selection}
            onClick={handleSplitAtPlayhead}
            size="sm"
            type="button"
            variant="outline"
          >
            <Scissors className="h-3.5 w-3.5" />
            Split (S)
          </Button>
          <Button
            disabled={!selection}
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
              onDragLeave={handleVideoLaneDragLeave}
              onDragOver={handleVideoLaneDragOver}
              onDrop={handleVideoLaneDrop}
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
                const isBeingReordered =
                  pendingDrag?.kind === "segment-move" &&
                  pendingDrag.placementId === segment.placementId;
                const translateX = isBeingReordered
                  ? (pendingDrag.translateX ?? 0)
                  : 0;
                return (
                  <SegmentClipBox
                    isBeingReordered={isBeingReordered}
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
                    translateX={translateX}
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
            {binDropIndicatorPx !== null ? (
              <BinDropIndicator
                heightPx={VIDEO_TRACK_HEIGHT}
                leftPx={binDropIndicatorPx}
              />
            ) : null}
            {snapMarker !== null ? (
              <SnapIndicator
                heightPx={VIDEO_TRACK_HEIGHT + AUDIO_TRACK_HEIGHT + 8}
                kind={snapMarker.kind}
                leftPx={snapMarker.seconds * pxPerSecond}
              />
            ) : null}
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
        clip at playhead
      </span>
      <span>
        <kbd className="rounded border bg-muted px-1">Del</kbd> remove
        selected clip
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
  onDragLeave,
  onDragOver,
  onDrop,
  top,
  widthPx,
}: {
  children: React.ReactNode;
  height: number;
  label: string;
  onDragLeave?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  top: number;
  widthPx: number;
}) {
  return (
    <div
      className="absolute rounded-md border bg-muted/20"
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
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
  isBeingReordered,
  isSelected,
  leftPx,
  onPointerDown,
  segment,
  translateX,
  widthPx,
}: {
  isBeingReordered: boolean;
  isSelected: boolean;
  leftPx: number;
  onPointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    mode: "move" | "trim-left" | "trim-right",
  ) => void;
  segment: AssemblySegmentClip;
  /**
   * Px translation applied while a reorder drag is in progress, so the
   * dragged clip visually follows the cursor.
   */
  translateX: number;
  widthPx: number;
}) {
  const timelineDuration = getPlacementTimelineDurationSeconds(segment);
  const speedPercent = Math.round((segment.playbackRate ?? 1) * 100);
  const appearance = segmentVariantClipClasses(segment.isActiveVariant);
  return (
    <div
      className={cn(
        "absolute top-1 flex h-[calc(100%-8px)] cursor-grab select-none items-stretch rounded-md border transition-shadow",
        segmentVariantClipShellClass(
          segment.isActiveVariant,
          !segment.isActiveVariant ? "opacity-90" : undefined,
        ),
        segmentVariantSelectionRingClass(
          segment.isActiveVariant,
          isSelected,
        ),
        isBeingReordered &&
          "z-30 opacity-80 shadow-[0_0_0_2px_rgba(34,197,94,0.55),0_8px_16px_rgba(0,0,0,0.25)]",
      )}
      // Explicitly disable HTML5 drag-and-drop on the clip body — the
      // video lane's TrackLane sets `onDragOver` / `onDrop` for the bin
      // drop target, which on Chrome can otherwise hijack pointer drags
      // that originate from a child with selectable text and turn them
      // into a text-selection drag instead of a pointermove sequence.
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => onPointerDown(event, "move")}
      style={
        {
          left: leftPx,
          transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
          width: widthPx,
        } satisfies CSSProperties
      }
    >
      <TrimHandle
        onPointerDown={(event) => onPointerDown(event, "trim-left")}
        side="left"
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between px-2 py-1 text-[11px] text-foreground">
        {segment.variantCountAtPosition > 1 ? (
          <div
            className={cn(
              "truncate text-[10px] font-medium uppercase tracking-wide",
              appearance.variantLabel,
            )}
          >
            {segment.variantLabel}
          </div>
        ) : null}
        <div className={cn("truncate font-medium", appearance.title)}>
          {segment.title}
        </div>
        <div className="truncate tabular-nums text-foreground/70">
          {timelineDuration.toFixed(1)}s · {speedPercent}% · in{" "}
          {segment.inSeconds.toFixed(1)}s · out {segment.outSeconds.toFixed(1)}s
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

function BinDropIndicator({
  heightPx,
  leftPx,
}: {
  heightPx: number;
  leftPx: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-40"
      style={{ height: heightPx, left: leftPx, top: 0 }}
    >
      <div className="absolute -left-[6px] -top-[6px] h-3 w-3 rotate-45 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
      <div className="h-full w-[3px] -translate-x-[1px] bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
    </div>
  );
}

/**
 * Thin vertical guideline rendered while a drag is snapped to a clip
 * boundary or the playhead. Differs from {@link BinDropIndicator} by being
 * narrower (snap is informational, not the drop target itself) and by
 * colour-coding the kind of boundary the audio is sticking to.
 */
function SnapIndicator({
  heightPx,
  kind,
  leftPx,
}: {
  heightPx: number;
  kind: SnapTargetKind;
  leftPx: number;
}) {
  // Yellow for video boundaries (the most useful case), cyan for other
  // audio clip boundaries, magenta for the playhead, neutral for origin.
  const color =
    kind === "video-boundary" || kind === "video-start"
      ? "rgb(234, 179, 8)" // amber-500
      : kind === "audio-boundary"
        ? "rgb(34, 211, 238)" // cyan-400
        : kind === "playhead"
          ? "rgb(244, 63, 94)" // rose-500
          : "rgb(148, 163, 184)"; // slate-400
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-30"
      style={{ height: heightPx, left: leftPx, top: 0 }}
    >
      <div
        className="h-full w-px"
        style={{
          backgroundColor: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
      <div
        className="absolute -left-[3px] -top-[3px] h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div
        className="absolute -left-[3px] -bottom-[3px] h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
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

  if (pendingDrag.kind === "segment-move") {
    // Mirror the bin-drop indicator: a green vertical line at the proposed
    // insertion position. The dragged clip itself stays at its committed
    // geometry until pointerup.
    return (
      <BinDropIndicator
        heightPx={videoTrackHeight}
        leftPx={pendingDrag.indicatorX}
      />
    );
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
