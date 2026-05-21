/** Runway segment (Seedance) cost log operations. */
export const RUNWAY_SEGMENT_GENERATION_STARTED =
  "seedance_segment_generation_started" as const;
export const RUNWAY_SEGMENT_GENERATION_SUCCEEDED =
  "seedance_segment_generation_succeeded" as const;
export const RUNWAY_SEGMENT_GENERATION_REFUNDED =
  "seedance_segment_generation_refunded" as const;

/** Runway GPT-Image reference / cover operations (credit on started only). */
export const RUNWAY_REFERENCE_IMAGE_GENERATION_STARTED =
  "reference_image_generation_started" as const;
export const RUNWAY_REFERENCE_IMAGE_GENERATION_REFUNDED =
  "reference_image_generation_refunded" as const;

export const RUNWAY_SEEDANCE_SEGMENT_OPERATIONS = new Set([
  RUNWAY_SEGMENT_GENERATION_STARTED,
  RUNWAY_SEGMENT_GENERATION_SUCCEEDED,
  RUNWAY_SEGMENT_GENERATION_REFUNDED,
]);

/**
 * Historical failed Seedance tasks: Runway refunded ~521 of 840 logged credits
 * (net ~319 charged). Used only by the one-off backfill planner.
 */
export const HISTORICAL_FAILED_SEGMENT_REFUND_FRACTION = 521 / 840;
