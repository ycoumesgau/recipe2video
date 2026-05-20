import type { Json } from "@/shared/supabase/database.types";

import type { ExportStatus } from "./export-status";

/**
 * Legacy shape kept so older `compositions.audio_sync` rows can still be read.
 * New code should use {@link AssemblyTimelineState} instead.
 */
export interface AssemblyAudioSync {
  offsetSeconds: number;
  cutFromSeconds: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

/**
 * A persisted reference to a Seedance segment placed on the timeline.
 *
 * The same `segmentId` may appear in multiple placements with different
 * `[inSeconds, outSeconds]` windows — that's the whole point of the
 * placements model and what makes split / middle-cut workflows possible.
 *
 * See `docs/assembly-segment-placements-plan.md` for the rationale.
 */
export interface SegmentPlacement {
  /** Stable id for this placement on the timeline. UUID generated client-side. */
  placementId: string;
  /** Foreign key to `seedance_segments.id`. May appear in several placements. */
  segmentId: string;
  /** Trim window inside the source media, in seconds. */
  inSeconds: number;
  outSeconds: number;
  /**
   * Linear gain applied to the source video's audio track, in `[0, 2]`.
   * Default `1`. To mute the diegetic audio of a clip while keeping the
   * music, set to `0`. To raise an ASMR sound effect above the music for
   * a specific zone, split the placement and set a higher volume on the
   * sub-placement.
   */
  volume: number;
  /**
   * Playback speed multiplier for this placement. `1` = 100% (normal speed).
   * Timeline duration is `(outSeconds - inSeconds) / playbackRate`.
   */
  playbackRate: number;
}

/**
 * Runtime shape the editor reads. Joins a {@link SegmentPlacement} with the
 * metadata from its source `seedance_segments` row and `media_assets` row.
 *
 * Each timeline appearance gets its own `placementId`, so two pieces of the
 * same source media coexist with the same `segmentId` but distinct trims.
 */
export interface AssemblySegmentClip {
  /** Stable per-placement id. Used as React key + drag discriminator. */
  placementId: string;
  segmentId: string;
  mediaAssetId: string;
  generationId?: string | null;
  title: string;
  position: number;
  /**
   * Original duration of the source media (read-only, drives trim bounds).
   */
  durationSeconds: number;
  /**
   * Seconds to skip from the source media (left trim handle).
   */
  inSeconds: number;
  /**
   * Seconds in the source media where playback ends (right trim handle).
   * Always satisfies `inSeconds < outSeconds <= durationSeconds`.
   */
  outSeconds: number;
  /**
   * Linear gain applied to the source video's audio track, in `[0, 2]`.
   * See {@link SegmentPlacement.volume} for the mixing semantics.
   */
  volume: number;
  /**
   * Playback speed multiplier. See {@link SegmentPlacement.playbackRate}.
   */
  playbackRate: number;
  sourceUrl: string;
  storageBucket: string;
  storagePath: string;
}

export interface AssemblyAudioTrack {
  mediaAssetId: string;
  title: string;
  sourceUrl: string;
  durationSeconds?: number | null;
}

/**
 * A free-positioned audio segment on the timeline. Replaces the single
 * {@link AssemblyAudioSync} object.
 */
export interface AssemblyAudioClip {
  /** Stable id used by the UI for selection / drag tracking. */
  id: string;
  mediaAssetId: string;
  /** Position on the global timeline, in seconds (0 = start of video). */
  startOnTimelineSeconds: number;
  /** Trim from the start of the source audio, in seconds. */
  inSeconds: number;
  /** Trim end inside the source audio, in seconds. */
  outSeconds: number;
  /** Linear gain in [0, 1]. */
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export interface AssemblyRemotionProps {
  fps: number;
  width: number;
  height: number;
  segments: AssemblySegmentClip[];
  audio?: AssemblyAudioTrack | null;
  /** Legacy single-track audio sync, kept for backward compat in the player. */
  audioSync: AssemblyAudioSync;
  /** Free-positioned audio clips on the timeline. */
  audioClips: AssemblyAudioClip[];
  /**
   * When true, each segment clip shows its storyboard label (e.g. `S3. Title`)
   * in the Remotion preview while editing. Final cloud exports set this to false
   * so labels are not burned into the delivered MP4.
   */
  showSegmentTitles?: boolean;
}

/**
 * Persisted shape of the audio side of the timeline state inside
 * `compositions.audio_sync`. With the placements rollout, per-segment trims
 * live inline on each {@link SegmentPlacement} instead of in a separate map,
 * so this shape no longer carries `segmentTrims`.
 *
 * Older rows that still have a `segmentTrims` field get read tolerantly by
 * {@link readPlacementsState} — the field is just consumed once and not
 * persisted again. Older rows in the bare {@link AssemblyAudioSync} shape
 * are also still readable (one-off migration to a single audio clip on read).
 */
export interface AssemblyTimelineState {
  schema: "timeline_v2";
  audioClips: AssemblyAudioClip[];
}

export interface AssemblyPreset {
  id: string;
  videoId: string;
  name: string;
  segmentOrder: Json;
  audioMediaAssetId?: string | null;
  audioSync?: Json | null;
  remotionProps?: Json | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Composition {
  id: string;
  videoId: string;
  presetId?: string | null;
  exportMediaAssetId?: string | null;
  segmentOrder: Json;
  audioMediaAssetId?: string | null;
  audioSync?: Json | null;
  remotionProps?: Json | null;
  exportStatus: ExportStatus;
  /**
   * Raw `render_progress` JSON column. Parse with `readRenderProgress` from
   * `@/modules/assembly/render-progress` to get a typed snapshot. Stored as
   * Json (not the typed shape) so the legacy row reader does not have to know
   * about every new field we add during the hackathon.
   */
  renderProgress?: Json | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}
