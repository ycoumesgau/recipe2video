/**
 * Pure placement timing helpers shared by the assembly editor and Remotion.
 * Kept free of `server-only` and path aliases so the sandbox bundler can import
 * this file via a relative path from `remotion/`.
 */

const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 4;
const DEFAULT_PLAYBACK_RATE = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function clampPlacementPlaybackRate(value: number) {
  return clamp(value, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
}

export function getPlacementSourceTrimSeconds(placement: {
  inSeconds: number;
  outSeconds: number;
}) {
  return Math.max(placement.outSeconds - placement.inSeconds, 0);
}

/** Timeline duration of a placement, accounting for playback rate. */
export function getPlacementTimelineDurationSeconds(placement: {
  inSeconds: number;
  outSeconds: number;
  playbackRate?: number;
}) {
  const sourceTrim = getPlacementSourceTrimSeconds(placement);
  const rate = clampPlacementPlaybackRate(
    placement.playbackRate ?? DEFAULT_PLAYBACK_RATE,
  );
  return sourceTrim / rate;
}
