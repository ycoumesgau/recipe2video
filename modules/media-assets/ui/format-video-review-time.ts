/**
 * Formats a duration for short-form review clips (typically a few seconds).
 * Uses seconds with two decimal places instead of m:ss.
 */
export function formatVideoReviewTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "0.00";
  }

  return Math.max(0, seconds).toFixed(2);
}

export function formatVideoReviewTimeRange(
  currentSeconds: number,
  totalSeconds: number,
): string {
  return `${formatVideoReviewTime(currentSeconds)}\u00a0/\u00a0${formatVideoReviewTime(totalSeconds)}`;
}
