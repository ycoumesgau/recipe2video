/**
 * Helpers that read and write the timeline state stored in
 * `compositions.audio_sync`. The JSON column accepts either:
 *
 *   - The legacy {@link AssemblyAudioSync} shape: a single audio offset / cut /
 *     fade record, no per-segment trims.
 *   - The new {@link AssemblyTimelineState} shape (`schema: 'timeline_v2'`): a
 *     map of per-segment trims and an array of free-positioned audio clips.
 *
 * Reading must accept both shapes so existing rows keep working without a
 * data migration. Writing always emits the new shape.
 */

import type { Json } from "@/shared/supabase/database.types";

import type {
  AssemblyAudioClip,
  AssemblyAudioSync,
  AssemblySegmentClip,
  AssemblyTimelineState,
} from "./assembly.types";

const TIMELINE_SCHEMA = "timeline_v2" as const;

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
    segmentTrims: {},
    audioClips: [],
  };
}

/**
 * Decode whatever sits inside `compositions.audio_sync` into the new
 * timeline shape, deriving a single audio clip from the legacy fields
 * when applicable.
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
      segmentTrims: readSegmentTrims(value.segmentTrims),
      audioClips: readAudioClips(value.audioClips),
    };
  }

  // Legacy shape: { offsetSeconds, cutFromSeconds, fadeInSeconds, fadeOutSeconds }.
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
    segmentTrims: {},
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
 * Apply the persisted segmentTrims onto the available segments, clamped to
 * the source duration so a stale row cannot overflow the playable range.
 */
export function applySegmentTrims(
  segments: AssemblySegmentClip[],
  trims: AssemblyTimelineState["segmentTrims"],
): AssemblySegmentClip[] {
  return segments.map((segment) => {
    const trim = trims[segment.segmentId];
    const max = Math.max(segment.durationSeconds, 0.1);
    const inSeconds = clamp(readNumber(trim?.inSeconds, 0), 0, max - 0.1);
    const outSeconds = clamp(
      readNumber(trim?.outSeconds, max),
      inSeconds + 0.1,
      max,
    );

    return { ...segment, inSeconds, outSeconds };
  });
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
  const duration = Math.max(readNumber(input.durationSeconds, 30), 0.1);

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

function readSegmentTrims(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  const trims: AssemblyTimelineState["segmentTrims"] = {};

  for (const [segmentId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) {
      continue;
    }

    const inSeconds = Math.max(readNumber(raw.inSeconds, 0), 0);
    const outSeconds = Math.max(
      readNumber(raw.outSeconds, inSeconds + 0.1),
      inSeconds + 0.1,
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
      readNumber(raw.outSeconds, inSeconds + 0.1),
      inSeconds + 0.1,
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

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
