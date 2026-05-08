export const VIDEO_STATUSES = [
  "draft",
  "recipe_ingested",
  "clarification_needed",
  "storyboard_ready",
  "storyboard_approved",
  "references_ready",
  "generating",
  "review",
  "assembling",
  "exported",
  "failed",
] as const;

export type VideoStatus = (typeof VIDEO_STATUSES)[number];
