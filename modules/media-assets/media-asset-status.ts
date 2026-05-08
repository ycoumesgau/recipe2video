export const MEDIA_ASSET_STATUSES = [
  "pending",
  "stored",
  "uploaded_to_mux",
  "failed",
  "deleted",
  "archived",
] as const;

export type MediaAssetStatus = (typeof MEDIA_ASSET_STATUSES)[number];
