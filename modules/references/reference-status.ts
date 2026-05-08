export const REFERENCE_STATUSES = [
  "planned",
  "generating",
  "generated",
  "approved",
  "rejected",
  "uploaded_to_runway",
  "failed",
] as const;

export type ReferenceStatus = (typeof REFERENCE_STATUSES)[number];
