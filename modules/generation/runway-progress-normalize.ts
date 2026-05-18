import type { RunwayTaskStatus } from "./runway.types";

/**
 * Normalizes Runway's `progress` field (0–1 or 0–100) into a 0–100 UI value.
 * Shared by Seedance generation polling and recipe reference image polling.
 */
export function normalizeRunwayProgress(
  progress: number | undefined,
  status: RunwayTaskStatus["status"],
) {
  if (status === "SUCCEEDED") {
    return 100;
  }
  if (status === "FAILED" || status === "CANCELLED") {
    return null;
  }
  if (typeof progress !== "number" || Number.isNaN(progress)) {
    return null;
  }

  if (progress <= 1) {
    return Number((progress * 100).toFixed(2));
  }

  return Number(Math.min(progress, 100).toFixed(2));
}
