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

export const VIDEO_STATUS_LABELS: Record<VideoStatus, string> = {
  draft: "Draft",
  recipe_ingested: "Recipe ingested",
  clarification_needed: "Clarification needed",
  storyboard_ready: "Storyboard ready",
  storyboard_approved: "Storyboard approved",
  references_ready: "References ready",
  generating: "Generating",
  review: "Review",
  assembling: "Assembling",
  exported: "Exported",
  failed: "Failed",
};

export const ACTIONABLE_VIDEO_STATUSES: readonly VideoStatus[] = [
  "clarification_needed",
  "storyboard_ready",
  "references_ready",
  "review",
  "assembling",
  "failed",
];

/** Badge variant for each project status (library cards, sub-pages, etc.). */
export type VideoStatusBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success";

export const VIDEO_STATUS_BADGE_VARIANT: Record<
  VideoStatus,
  VideoStatusBadgeVariant
> = {
  draft: "outline",
  recipe_ingested: "secondary",
  clarification_needed: "destructive",
  storyboard_ready: "default",
  storyboard_approved: "secondary",
  references_ready: "default",
  generating: "default",
  review: "default",
  assembling: "secondary",
  exported: "success",
  failed: "destructive",
};
