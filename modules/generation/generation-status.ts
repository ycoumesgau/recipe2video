export const GENERATION_STATUSES = [
  "pending",
  "queued",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
] as const;

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];
