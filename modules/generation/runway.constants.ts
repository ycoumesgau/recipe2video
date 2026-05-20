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
/**
 * Seedance 2 `text_to_video` accepts up to 3 video references in
 * `referenceVideos[]`, with a combined duration cap of 15 seconds. Used
 * by the standardized outro segment to ground the Licorn celebration on
 * the canonical CapCut video while staying within Runway's contract.
 *
 * Source: https://docs.dev.runwayml.com/guides/seedance/ (verified 2026-05-18).
 */
export const RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES = 3;
export const RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES_TOTAL_SECONDS = 15;
export const RUNWAY_SEEDANCE2_CREDITS_PER_SECOND = 40;
/**
 * Runway Seedance 2 `duration_seconds` only accepts integer seconds in this
 * inclusive range. Values outside it fail API validation with an opaque body
 * error; keep app-side checks aligned with this window.
 */
export const RUNWAY_SEEDANCE2_MIN_DURATION_SECONDS = 5;
export const RUNWAY_SEEDANCE2_MAX_DURATION_SECONDS = 15;
/**
 * Per-asset size cap for every Runway endpoint that accepts a reference URI
 * (Seedance `references[]`, GPT-Image 2 `referenceImages[]`, etc.). Oversize
 * assets are rejected with `Asset size exceeds 16.0MB.` — see
 * `scripts/normalize-asset-library-images.ts` for the offline fixer.
 */
export const RUNWAY_MAX_REFERENCE_BYTES = 16 * 1024 * 1024;

/**
 * Runway `gpt_image_2` pricing (default quality `high`, 2026-05 docs).
 * @see https://docs.dev.runwayml.com/guides/pricing/
 */
export const RUNWAY_GPT_IMAGE_2_CREDITS_1K_2K_HIGH = 20;
export const RUNWAY_GPT_IMAGE_2_CREDITS_4K_HIGH = 41;

/** Longest edge above this value bills at the 4K tier (`auto` included). */
export const RUNWAY_GPT_IMAGE_2_4K_LONG_EDGE_MIN = 2561;

/**
 * Estimates Runway credits for one `gpt_image_2` `text_to_image` task.
 * Runway does not return per-task credit usage; we mirror their published
 * quality/resolution table with default quality `high`.
 */
export function estimateGptImage2Credits(
  ratio: string,
  quality: "low" | "medium" | "high" | "auto" = "high",
): number {
  const tier = isGptImage2FourKRatio(ratio) ? "4k" : "1k_2k";
  const table =
    tier === "4k"
      ? {
          low: 2,
          medium: 11,
          high: RUNWAY_GPT_IMAGE_2_CREDITS_4K_HIGH,
          auto: RUNWAY_GPT_IMAGE_2_CREDITS_4K_HIGH,
        }
      : {
          low: 1,
          medium: 5,
          high: RUNWAY_GPT_IMAGE_2_CREDITS_1K_2K_HIGH,
          auto: RUNWAY_GPT_IMAGE_2_CREDITS_1K_2K_HIGH,
        };

  return table[quality];
}

function isGptImage2FourKRatio(ratio: string): boolean {
  if (ratio === "auto") {
    return true;
  }

  const match = /^(\d+):(\d+)$/.exec(ratio.trim());
  if (!match) {
    return false;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return false;
  }

  return Math.max(width, height) >= RUNWAY_GPT_IMAGE_2_4K_LONG_EDGE_MIN;
}
