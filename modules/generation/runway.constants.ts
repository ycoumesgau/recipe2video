export const RUNWAY_API_VERSION = "2024-11-06";
export const RUNWAY_POLL_INTERVAL_MS = 5_000;
export const RUNWAY_DEFAULT_VIDEO_MODEL = "seedance2";
export const RUNWAY_DEFAULT_REFERENCE_IMAGE_MODEL = "gpt_image_2";
export const RUNWAY_DEFAULT_VIDEO_RATIO = "1080:1920";
export const RUNWAY_DEFAULT_REFERENCE_IMAGE_RATIO = "auto";
/**
 * Aspect ratio used for recipe-specific reference images generated through
 * GPT-Image 2. Seedance segments render at vertical 9:16, so the anchor
 * must match that composition. `gpt_image_2`'s `text_to_image` endpoint
 * does NOT accept `1080:1920` even though Seedance does; the closest
 * exact 9:16 (verified against the live API as of 2026-05-18) is
 * `1440:2560` in the 2K tier. Same credit cost as 1K medium, higher
 * resolution = better grounding signal for downstream Seedance calls.
 */
export const RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO = "1440:2560";
export const RUNWAY_MAX_SEEDANCE_REFERENCES = 9;
export const RUNWAY_SEEDANCE2_CREDITS_PER_SECOND = 40;
/**
 * Runway Seedance 2 `duration_seconds` only accepts integer seconds in this
 * inclusive range. Values outside it fail API validation with an opaque body
 * error; keep app-side checks aligned with this window.
 */
export const RUNWAY_SEEDANCE2_MIN_DURATION_SECONDS = 5;
export const RUNWAY_SEEDANCE2_MAX_DURATION_SECONDS = 15;
