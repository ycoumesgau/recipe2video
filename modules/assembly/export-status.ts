export const EXPORT_STATUSES = [
  "pending",
  "rendering",
  "completed",
  "failed",
] as const;

export type ExportStatus = (typeof EXPORT_STATUSES)[number];
