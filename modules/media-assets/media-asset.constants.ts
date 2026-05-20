import type { MediaAssetType } from "./media-asset.types";

export const MEDIA_STORAGE_BUCKETS = {
  recipeSources: "recipe-sources",
  referenceImages: "reference-images",
  runwayOutputs: "runway-outputs",
  acceptedClips: "accepted-clips",
  sunoAudio: "suno-audio",
  finalExports: "final-exports",
  albumCovers: "album-covers",
  spotifyCanvases: "spotify-canvases",
} as const;

export type MediaStorageBucket =
  (typeof MEDIA_STORAGE_BUCKETS)[keyof typeof MEDIA_STORAGE_BUCKETS];

/** Signed URLs for recipe photos sent to the Cursor SDK (vision); keep > max agent runtime + retries. */
export const RECIPE_SOURCE_CURSOR_AGENT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

/** Short-lived signed URLs for dashboard thumbnails; regenerated on each page load. */
export const RECIPE_SOURCE_DASHBOARD_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Cap images per Cursor send to avoid model / request size issues. */
export const RECIPE_SOURCE_CURSOR_AGENT_MAX_IMAGES = 16;

/** Max images attached to a single recipe agent message (complementary notes or chat). */
export const MAX_AGENT_MESSAGE_ATTACHMENTS = 8;

export const AGENT_MESSAGE_ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp";

export const MEDIA_ASSET_STORAGE_BUCKET_BY_TYPE: Record<
  MediaAssetType,
  MediaStorageBucket
> = {
  recipe_source: MEDIA_STORAGE_BUCKETS.recipeSources,
  agent_message_attachment: MEDIA_STORAGE_BUCKETS.recipeSources,
  reference_image: MEDIA_STORAGE_BUCKETS.referenceImages,
  runway_output: MEDIA_STORAGE_BUCKETS.runwayOutputs,
  accepted_clip: MEDIA_STORAGE_BUCKETS.acceptedClips,
  suno_audio: MEDIA_STORAGE_BUCKETS.sunoAudio,
  final_export: MEDIA_STORAGE_BUCKETS.finalExports,
  album_cover_image: MEDIA_STORAGE_BUCKETS.albumCovers,
  spotify_canvas_video: MEDIA_STORAGE_BUCKETS.spotifyCanvases,
};
