/**
 * Helpers that read and write the timeline state stored across two columns of
 * `compositions`:
 *
 *   - `compositions.segment_order` — the ordered list of placements on the
 *     video track. Three persisted shapes are accepted on read (write always
 *     emits `placements_v1`):
 *       1. `{ schema: "placements_v1", placements: SegmentPlacement[] }` — new.
 *       2. `string[]` of segmentIds + an optional `segmentTrims` map carried
 *          on `audio_sync` (the post-#77 shape).
 *       3. Bare `string[]` of segmentIds (the pre-#77 shape).
 *
 *   - `compositions.audio_sync` — audio side of the timeline state. Three
 *     shapes accepted on read:
 *       1. `{ schema: "timeline_v2", audioClips: AssemblyAudioClip[] }` —
 *          current new shape (no more `segmentTrims`).
 *       2. `{ schema: "timeline_v2", segmentTrims: {...}, audioClips: [...] }`
 *          — the previous post-#77 shape; `segmentTrims` is consumed once by
 *          {@link readPlacementsState} and not persisted again.
 *       3. The very old {@link AssemblyAudioSync} shape (a single audio
 *          offset / cut / fade record) — projected to one audio clip on read.
 *
 * Reading must accept all of these so existing rows keep working without a
 * SQL migration. Writing always emits the new shape.
 */

import type { Json } from "@/shared/supabase/database.types";

import type {
  AssemblyAudioClip,
  AssemblyAudioSync,
  AssemblySegmentClip,
  AssemblyTimelineState,
  SegmentPlacement,
} from "./assembly.types";

import {
  clampPlacementPlaybackRate,
  getPlacementSourceTrimSeconds,
  getPlacementTimelineDurationSeconds,
} from "./placement-timing";

export {
  clampPlacementPlaybackRate,
  getPlacementSourceTrimSeconds,
  getPlacementTimelineDurationSeconds,
};

const TIMELINE_SCHEMA = "timeline_v2" as const;
const PLACEMENTS_SCHEMA = "placements_v1" as const;
const MIN_TRIM_WINDOW = 0.1;
const DEFAULT_PLAYBACK_RATE = 1;

export function getDefaultAudioSync(): AssemblyAudioSync {
  return {
    offsetSeconds: 0,
    cutFromSeconds: 0,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
  };
}

export function getEmptyTimelineState(): AssemblyTimelineState {
  return {
    schema: TIMELINE_SCHEMA,
    audioClips: [],
  };
}

/**
 * Decode whatever sits inside `compositions.audio_sync` into the new audio
 * timeline shape, deriving a single audio clip from the legacy fields when
 * applicable. Note: this function does NOT carry `segmentTrims` anymore;
 * those live inside the placements column. Use
 * {@link readPlacementsState} to materialise placements and apply legacy
 * trims to them.
 */
export function readTimelineState(
  value: Json | null | undefined,
  context: {
    audioMediaAssetId?: string | null;
    audioDurationSeconds?: number | null;
  },
): AssemblyTimelineState {
  if (!isRecord(value)) {
    return getEmptyTimelineState();
  }

  if (value.schema === TIMELINE_SCHEMA) {
    return {
      schema: TIMELINE_SCHEMA,
      audioClips: readAudioClips(value.audioClips),
    };
  }

  // Legacy `AssemblyAudioSync` shape: a single record of offset / cut / fades.
  // Convert it to a single audio clip whenever the composition has a linked
  // audio asset, so the UI can render it on the timeline without losing data.
  const legacy: AssemblyAudioSync = {
    offsetSeconds: readNumber(value.offsetSeconds, 0),
    cutFromSeconds: Math.max(readNumber(value.cutFromSeconds, 0), 0),
    fadeInSeconds: Math.max(readNumber(value.fadeInSeconds, 0), 0),
    fadeOutSeconds: Math.max(readNumber(value.fadeOutSeconds, 0), 0),
  };

  if (!context.audioMediaAssetId) {
    return getEmptyTimelineState();
  }

  const audioDuration = Math.max(
    readNumber(context.audioDurationSeconds, 0),
    legacy.cutFromSeconds + 1,
  );

  return {
    schema: TIMELINE_SCHEMA,
    audioClips: [
      {
        id: createAudioClipId(context.audioMediaAssetId, 0),
        mediaAssetId: context.audioMediaAssetId,
        startOnTimelineSeconds: Math.max(legacy.offsetSeconds, 0),
        inSeconds: legacy.cutFromSeconds,
        outSeconds: audioDuration,
        volume: 1,
        fadeInSeconds: legacy.fadeInSeconds,
        fadeOutSeconds: legacy.fadeOutSeconds,
      },
    ],
  };
}

/**
 * Decode the placements list from `compositions.segment_order`, falling back
 * to the legacy shapes (pure `string[]` and `string[] + segmentTrims`).
 * Placements that point to a `segmentId` not present in
 * {@link availableSegmentDurations} are silently dropped — the same defensive
 * behaviour the legacy reader already had.
 *
 * @param segmentOrderJson    raw value of `compositions.segment_order`
 * @param audioSyncJson       raw value of `compositions.audio_sync` (used to
 *                            recover a stored `segmentTrims` map when the
 *                            persisted shape was the post-#77 one)
 * @param availableSegmentDurations  map from segmentId to source duration in
 *                                   seconds; used to default `outSeconds`
 *                                   when no trim is stored, and to clamp
 *                                   stored trims to the playable range.
 */
export function readPlacementsState(
  segmentOrderJson: Json | null | undefined,
  audioSyncJson: Json | null | undefined,
  availableSegmentDurations: Map<string, number>,
): SegmentPlacement[] {
  // Path 1 — current shape: { schema: "placements_v1", placements: [...] }.
  if (
    isRecord(segmentOrderJson) &&
    segmentOrderJson.schema === PLACEMENTS_SCHEMA &&
    Array.isArray(segmentOrderJson.placements)
  ) {
    return segmentOrderJson.placements.flatMap(
      (raw, index): SegmentPlacement[] =>
        buildPlacementFromRecord(raw, availableSegmentDurations, index),
    );
  }

  // Paths 2 & 3 — legacy: segment_order is a string[] of segmentIds. The
  // corresponding [in, out] window may live in audio_sync.segmentTrims (post
  // #77) or default to [0, durationSeconds] (pre #77).
  if (Array.isArray(segmentOrderJson)) {
    const trims = isRecord(audioSyncJson)
      ? readSegmentTrims(audioSyncJson.segmentTrims)
      : {};
    return segmentOrderJson.flatMap((raw, index): SegmentPlacement[] => {
      if (typeof raw !== "string") {
        return [];
      }
      const duration = availableSegmentDurations.get(raw);
      if (duration === undefined) {
        // Segment no longer available — drop on read, same as before.
        return [];
      }
      const trim = trims[raw];
      const max = Math.max(duration, MIN_TRIM_WINDOW);
      const inSeconds = clamp(
        readNumber(trim?.inSeconds, 0),
        0,
        max - MIN_TRIM_WINDOW,
      );
      const outSeconds = clamp(
        readNumber(trim?.outSeconds, max),
        inSeconds + MIN_TRIM_WINDOW,
        max,
      );
      return [
        {
          placementId: createPlacementId(raw, index),
          segmentId: raw,
          inSeconds,
          outSeconds,
          volume: 1,
          playbackRate: DEFAULT_PLAYBACK_RATE,
        },
      ];
    });
  }

  return [];
}

/**
 * Build a runtime {@link AssemblySegmentClip} for each placement by joining
 * with the catalogue of available segments (segmentId → segment metadata).
 * Placements whose segmentId is missing from the catalogue are dropped — this
 * is also where signed-URL expiry / missing media_asset shows up at runtime.
 */
export function buildClipsFromPlacements(
  placements: SegmentPlacement[],
  availableBySegmentId: Map<
    string,
      Omit<
      AssemblySegmentClip,
      | "placementId"
      | "position"
      | "inSeconds"
      | "outSeconds"
      | "volume"
      | "playbackRate"
    >
  >,
): AssemblySegmentClip[] {
  const clips: AssemblySegmentClip[] = [];
  placements.forEach((placement, index) => {
    const meta = availableBySegmentId.get(placement.segmentId);
    if (!meta) {
      return;
    }
    const max = Math.max(meta.durationSeconds, MIN_TRIM_WINDOW);
    const inSeconds = clamp(placement.inSeconds, 0, max - MIN_TRIM_WINDOW);
    const outSeconds = clamp(
      placement.outSeconds,
      inSeconds + MIN_TRIM_WINDOW,
      max,
    );
    clips.push({
      ...meta,
      placementId: placement.placementId,
      position: index,
      inSeconds,
      outSeconds,
      volume: clamp(placement.volume, 0, 2),
      playbackRate: clampPlacementPlaybackRate(placement.playbackRate),
    });
  });
  return clips;
}

/**
 * Build the default placements list when a project is opened for the first
 * time with no composition row yet: one placement per accepted segment, in
 * declared order, covering the full source duration.
 */
export function defaultPlacementsForSegments(
  acceptedSegments: Array<{ segmentId: string; durationSeconds: number }>,
): SegmentPlacement[] {
  return acceptedSegments.map((segment, index) => ({
    placementId: createPlacementId(segment.segmentId, index),
    segmentId: segment.segmentId,
    inSeconds: 0,
    outSeconds: Math.max(segment.durationSeconds, MIN_TRIM_WINDOW),
    volume: 1,
    playbackRate: DEFAULT_PLAYBACK_RATE,
  }));
}

/**
 * Split a placement at a given source-media offset (in seconds, in the
 * source media's timeline, NOT the global assembly timeline). The placement
 * is replaced by two adjacent placements that share the same `segmentId`
 * but have distinct `placementId`s and complementary `[in, out]` windows.
 *
 * Returns `null` if the split point is invalid: outside the placement's
 * `[in, out]` window or too close (<{@link MIN_TRIM_WINDOW}) to either edge.
 *
 * Pure function so it can be unit-tested without React state. The parent
 * component is responsible for calling its own `onChange` handler with the
 * returned array.
 */
export function splitPlacementAtSourceSeconds<
  T extends {
    placementId: string;
    segmentId: string;
    inSeconds: number;
    outSeconds: number;
  },
>(
  placements: T[],
  placementId: string,
  splitSourceSeconds: number,
  newPlacementId: string,
): { next: T[]; rightPlacementId: string } | null {
  const idx = placements.findIndex((p) => p.placementId === placementId);
  if (idx === -1) {
    return null;
  }
  const target = placements[idx];
  if (!target) {
    return null;
  }
  if (
    splitSourceSeconds <= target.inSeconds + MIN_TRIM_WINDOW ||
    splitSourceSeconds >= target.outSeconds - MIN_TRIM_WINDOW
  ) {
    return null;
  }
  const left = { ...target, outSeconds: splitSourceSeconds };
  const right = {
    ...target,
    placementId: newPlacementId,
    inSeconds: splitSourceSeconds,
  };
  const next = [
    ...placements.slice(0, idx),
    left,
    right,
    ...placements.slice(idx + 1),
  ];
  return { next, rightPlacementId: newPlacementId };
}

/**
 * Insert a freshly-built placement at a specific index, used by the bin
 * drop handler. The resulting array is otherwise unchanged. Pure function
 * for unit testing.
 */
export function insertPlacementAt<T>(
  placements: T[],
  index: number,
  placement: T,
): T[] {
  const safeIndex = Math.max(0, Math.min(index, placements.length));
  return [
    ...placements.slice(0, safeIndex),
    placement,
    ...placements.slice(safeIndex),
  ];
}

/**
 * Compute where a horizontal drop position lands on the timeline (insertion
 * index between existing placements). Drops past the end append. Used by
 * the video-track drop target when a segment card is dropped from the bin.
 */
export function computeDropInsertIndex(
  layouts: Array<{ startSeconds: number; durationSeconds: number }>,
  dropSeconds: number,
): number {
  for (let i = 0; i < layouts.length; i += 1) {
    const layout = layouts[i];
    if (!layout) {
      continue;
    }
    const center = layout.startSeconds + layout.durationSeconds / 2;
    if (dropSeconds < center) {
      return i;
    }
  }
  return layouts.length;
}

/**
 * Compute where a clip-being-reordered would land if released, and the
 * corresponding insertion-line X position in pixels.
 *
 * The algorithm is cursor-driven: scan the OTHERS array (the layout we'd
 * get by removing the dragged clip from its current slot) and pick the
 * insertion gap whose surrounding centres straddle the cursor position.
 * This matches the CapCut / Premiere feel where "where the cursor is, that's
 * where the clip lands" — no need to drag the clip's full body past a
 * neighbour to trigger a swap.
 *
 * Returns:
 *   - `newIndex`: the index, in the array AFTER the dragged clip is
 *     spliced out, where it should be reinserted on commit. Always within
 *     `[0, layouts.length - 1]`.
 *   - `indicatorSeconds`: the timeline position (in seconds) where the
 *     visual insertion line should be drawn — the start of the slot where
 *     the dragged clip will land.
 */
export function computeReorderInsertIndex(
  layouts: Array<{ startSeconds: number; durationSeconds: number }>,
  draggedIdx: number,
  cursorSeconds: number,
): { newIndex: number; indicatorSeconds: number } {
  if (
    draggedIdx < 0 ||
    draggedIdx >= layouts.length ||
    layouts.length === 0
  ) {
    return { newIndex: 0, indicatorSeconds: 0 };
  }
  // Cumulative starts and centres of the OTHERS array (the array we'd
  // get by removing the dragged clip), in their post-splice coordinate
  // system, plus a final "append at the end" entry.
  type Slot = { start: number; center: number; duration: number };
  const others: Slot[] = [];
  let cumulative = 0;
  for (let i = 0; i < layouts.length; i += 1) {
    const layout = layouts[i];
    if (!layout || i === draggedIdx) {
      continue;
    }
    others.push({
      start: cumulative,
      center: cumulative + layout.durationSeconds / 2,
      duration: layout.durationSeconds,
    });
    cumulative += layout.durationSeconds;
  }
  // Insertion slots: index 0 is "before the first other", index k is
  // "between others[k-1] and others[k]", final index is "after the last".
  // newIndex == k means the dragged clip ends up at index k in the
  // post-splice array.
  let newIndex = 0;
  for (let k = 0; k < others.length; k += 1) {
    const other = others[k];
    if (!other) {
      continue;
    }
    if (cursorSeconds >= other.center) {
      newIndex = k + 1;
    } else {
      break;
    }
  }
  const indicatorSeconds =
    newIndex < others.length
      ? (others[newIndex]?.start ?? 0)
      : (others[others.length - 1]?.start ?? 0) +
        (others[others.length - 1]?.duration ?? 0);
  return { newIndex, indicatorSeconds };
}

/**
 * Generate a fresh placementId. UUID-flavoured but readable, used both by
 * split (right half) and bin drop (new placement).
 */
export function generatePlacementId() {
  // crypto.randomUUID is widely available in modern browsers and Node 19+.
  // Fall back to a Math.random suffix for environments without crypto (e.g.
  // very old jsdom in tests) so we never throw.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `placement_${globalThis.crypto.randomUUID().slice(0, 12)}`;
  }
  return `placement_${Math.floor(Math.random() * 1e12).toString(36)}`;
}

/**
 * Project an {@link AssemblyTimelineState} to the legacy {@link AssemblyAudioSync}
 * shape, used to keep the Remotion preview composition working unchanged for
 * timelines that contain at most one audio clip. With more clips the preview
 * already reads `audioClips` directly.
 */
export function projectLegacyAudioSync(
  audioClips: AssemblyAudioClip[],
): AssemblyAudioSync {
  const first = audioClips[0];

  if (!first) {
    return getDefaultAudioSync();
  }

  return {
    offsetSeconds: first.startOnTimelineSeconds,
    cutFromSeconds: first.inSeconds,
    fadeInSeconds: first.fadeInSeconds,
    fadeOutSeconds: first.fadeOutSeconds,
  };
}

/**
 * Build an audio clip pre-populated with sensible defaults the first time a
 * Suno track is attached to a composition that has no prior `audio_sync`.
 */
export function createDefaultAudioClip(input: {
  mediaAssetId: string;
  durationSeconds?: number | null;
}): AssemblyAudioClip {
  const duration = Math.max(readNumber(input.durationSeconds, 30), MIN_TRIM_WINDOW);

  return {
    id: createAudioClipId(input.mediaAssetId, 0),
    mediaAssetId: input.mediaAssetId,
    startOnTimelineSeconds: 0,
    inSeconds: 0,
    outSeconds: duration,
    volume: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
  };
}

/**
 * Serialise the placements list into the persisted JSON shape stored on
 * `compositions.segment_order`.
 */
export function serializePlacements(placements: SegmentPlacement[]) {
  return {
    schema: PLACEMENTS_SCHEMA,
    placements: placements.map((placement) => ({
      placementId: placement.placementId,
      segmentId: placement.segmentId,
      inSeconds: placement.inSeconds,
      outSeconds: placement.outSeconds,
      volume: placement.volume,
      playbackRate: clampPlacementPlaybackRate(placement.playbackRate),
    })),
  };
}

function buildPlacementFromRecord(
  raw: unknown,
  availableSegmentDurations: Map<string, number>,
  index: number,
): SegmentPlacement[] {
  if (!isRecord(raw)) {
    return [];
  }
  const segmentId =
    typeof raw.segmentId === "string" && raw.segmentId.length > 0
      ? raw.segmentId
      : null;
  if (!segmentId) {
    return [];
  }
  const duration = availableSegmentDurations.get(segmentId);
  if (duration === undefined) {
    return [];
  }
  const max = Math.max(duration, MIN_TRIM_WINDOW);
  const inSeconds = clamp(
    readNumber(raw.inSeconds, 0),
    0,
    max - MIN_TRIM_WINDOW,
  );
  const outSeconds = clamp(
    readNumber(raw.outSeconds, max),
    inSeconds + MIN_TRIM_WINDOW,
    max,
  );
  return [
    {
      placementId:
        typeof raw.placementId === "string" && raw.placementId.length > 0
          ? raw.placementId
          : createPlacementId(segmentId, index),
      segmentId,
      inSeconds,
      outSeconds,
      volume: clamp(readNumber(raw.volume, 1), 0, 2),
      playbackRate: clampPlacementPlaybackRate(
        readNumber(raw.playbackRate, DEFAULT_PLAYBACK_RATE),
      ),
    },
  ];
}

function readSegmentTrims(value: unknown): Record<
  string,
  { inSeconds: number; outSeconds: number }
> {
  if (!isRecord(value)) {
    return {};
  }
  const trims: Record<string, { inSeconds: number; outSeconds: number }> = {};
  for (const [segmentId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) {
      continue;
    }
    const inSeconds = Math.max(readNumber(raw.inSeconds, 0), 0);
    const outSeconds = Math.max(
      readNumber(raw.outSeconds, inSeconds + MIN_TRIM_WINDOW),
      inSeconds + MIN_TRIM_WINDOW,
    );
    trims[segmentId] = { inSeconds, outSeconds };
  }
  return trims;
}

function readAudioClips(value: unknown): AssemblyAudioClip[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((raw, index): AssemblyAudioClip[] => {
    if (!isRecord(raw)) {
      return [];
    }
    const mediaAssetId =
      typeof raw.mediaAssetId === "string" && raw.mediaAssetId.length > 0
        ? raw.mediaAssetId
        : null;
    if (!mediaAssetId) {
      return [];
    }
    const inSeconds = Math.max(readNumber(raw.inSeconds, 0), 0);
    const outSeconds = Math.max(
      readNumber(raw.outSeconds, inSeconds + MIN_TRIM_WINDOW),
      inSeconds + MIN_TRIM_WINDOW,
    );
    return [
      {
        id:
          typeof raw.id === "string" && raw.id.length > 0
            ? raw.id
            : createAudioClipId(mediaAssetId, index),
        mediaAssetId,
        startOnTimelineSeconds: Math.max(
          readNumber(raw.startOnTimelineSeconds, 0),
          0,
        ),
        inSeconds,
        outSeconds,
        volume: clamp(readNumber(raw.volume, 1), 0, 2),
        fadeInSeconds: Math.max(readNumber(raw.fadeInSeconds, 0), 0),
        fadeOutSeconds: Math.max(readNumber(raw.fadeOutSeconds, 0), 0),
      },
    ];
  });
}

function createAudioClipId(mediaAssetId: string, index: number) {
  return `audio_${mediaAssetId.slice(0, 8)}_${index}`;
}

function createPlacementId(segmentId: string, index: number) {
  return `placement_${segmentId.slice(0, 8)}_${index}`;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
