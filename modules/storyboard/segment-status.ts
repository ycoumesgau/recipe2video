export const SEGMENT_STATUSES = [
  "pending",
  "ready",
  "queued",
  "generating",
  "review",
  "accepted",
  "rejected",
  "failed",
  "blocked",
] as const;

export type SegmentStatus = (typeof SEGMENT_STATUSES)[number];
