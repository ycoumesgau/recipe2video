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
  /**
   * Set by the orchestrator when one of the segment's required references
   * is an `extracted_frame_pending` placeholder pointing at an upstream
   * segment that has not been rendered yet. The segment leaves this
   * status as soon as the operator extracts the upstream frame and
   * attaches it to this segment via the segment-review UI.
   */
  "awaiting_upstream_frame",
] as const;

export type SegmentStatus = (typeof SEGMENT_STATUSES)[number];
