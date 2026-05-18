export const RUNWAY_API_VERSION = "2024-11-06";
export const RUNWAY_POLL_INTERVAL_MS = 5_000;
export const RUNWAY_DEFAULT_VIDEO_MODEL = "seedance2";
export const RUNWAY_DEFAULT_REFERENCE_IMAGE_MODEL = "gpt_image_2";
export const RUNWAY_DEFAULT_VIDEO_RATIO = "1080:1920";
export const RUNWAY_DEFAULT_REFERENCE_IMAGE_RATIO = "auto";
/**
 * Aspect ratio used for recipe-specific reference images generated through
 * GPT-Image 2. Seedance segments render at `1080:1920` (vertical 9:16) so
 * the anchor frames the dish under the same composition the downstream
 * model will produce. `gpt_image_2` supports this ratio natively on the
 * `text_to_image` endpoint.
 */
export const RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO = "1080:1920";
export const RUNWAY_MAX_SEEDANCE_REFERENCES = 9;
export const RUNWAY_SEEDANCE2_CREDITS_PER_SECOND = 40;
