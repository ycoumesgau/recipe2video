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

export interface AssemblySegmentClip {
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
  /** Per-segment trim values. Falls back to `[0, durationSeconds]` if missing. */
  audioClips: AssemblyAudioClip[];
}

/**
 * Persisted shape of the timeline state inside `compositions.audio_sync`.
 * The column name stays the same to avoid a schema migration; the JSON is
 * a discriminated union: legacy `AssemblyAudioSync` or the new shape.
 */
export interface AssemblyTimelineState {
  schema: "timeline_v2";
  segmentTrims: Record<string, { inSeconds: number; outSeconds: number }>;
  audioClips: AssemblyAudioClip[];
}

export interface Composition {
  id: string;
  videoId: string;
  exportMediaAssetId?: string | null;
  segmentOrder: Json;
  audioMediaAssetId?: string | null;
  audioSync?: Json | null;
  remotionProps?: Json | null;
  exportStatus: ExportStatus;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}
