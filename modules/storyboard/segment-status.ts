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

/**
 * Whether a storyboard slot already has an operator-approved take.
 *
 * `segments.selected_generation_id` is the source of truth for the accepted
 * variant. A later failed or cancelled Runway task must not make totals treat
 * the slot as unvalidated when that pointer is still set.
 */
export function segmentHasAcceptedVariant(segment: {
  status: SegmentStatus;
  selectedGenerationId?: string | null;
}): boolean {
  if (segment.selectedGenerationId) {
    return true;
  }

  return segment.status === "accepted";
}

/**
 * Segment row status after a generation attempt ends without a new accepted take.
 * Preserves `accepted` when an earlier variant is still selected.
 */
export function segmentStatusAfterFailedGeneration(segment: {
  status: SegmentStatus;
  selectedGenerationId?: string | null;
}): SegmentStatus {
  if (segmentHasAcceptedVariant(segment)) {
    return "accepted";
  }

  return "failed";
}
