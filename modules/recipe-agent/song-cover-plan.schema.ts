import { z } from "zod";

/**
 * Zod schema mirroring `contracts/song-cover.md` in
 * `recipe2video-agent-workspace`. Validates `agent-recipes/{videoId}/
 * song-cover-plan.json` at sync time. See that contract for the
 * authoritative field semantics — this file only encodes structural
 * invariants the app can verify without database lookups (canonical
 * name resolution against the live library + per-video reference
 * assets is done by the sync use case after schema validation).
 */

const CanonicalNameSchema = z
  .string()
  .min(1, "Canonical name must not be empty")
  .max(120, "Canonical name must be 120 characters or less")
  .regex(
    /^[A-Za-z0-9_]+$/,
    "Canonical name must contain only letters, digits and underscores",
  );

const AlbumCoverSchema = z
  .object({
    prompt: z
      .string()
      .min(
        50,
        "Album cover prompt must be at least 50 characters (Spotify covers without a real prompt produce bland artwork)",
      ),
    conditioningReferences: z
      .array(CanonicalNameSchema)
      .max(
        16,
        "GPT-Image 2 accepts at most 16 reference images per generation",
      )
      .default([]),
    notes: z.string().max(2000).optional(),
  })
  .strict();

/**
 * Hint used by the UI and downstream prompt checks. Does NOT change
 * generation parameters: the Canvas prompt itself drives the motion.
 */
export const MASCOT_APPEARANCE_MODES = [
  "discrete_gesture",
  "silhouette_presence",
  "celebration",
] as const;

export const SPOTIFY_CANVAS_MIN_DURATION_SECONDS = 5;
export const SPOTIFY_CANVAS_MAX_DURATION_SECONDS = 8;

const SpotifyCanvasSchema = z
  .object({
    prompt: z
      .string()
      .min(
        50,
        "Spotify Canvas prompt must be at least 50 characters and must include an explicit loop instruction",
      ),
    imageReferences: z
      .array(CanonicalNameSchema)
      .min(1, "Spotify Canvas needs at least one image reference")
      .max(9, "Seedance 2 accepts at most 9 image references per generation"),
    videoReferences: z
      .array(CanonicalNameSchema)
      .max(
        3,
        "Seedance 2 accepts at most 3 video references per generation (combined <= 15s)",
      )
      .default([]),
    loopAnchorReferenceName: CanonicalNameSchema,
    durationSeconds: z
      .number()
      .int("durationSeconds must be an integer (Seedance 2 only accepts integer seconds)")
      .min(
        SPOTIFY_CANVAS_MIN_DURATION_SECONDS,
        `durationSeconds must be >= ${SPOTIFY_CANVAS_MIN_DURATION_SECONDS} (Seedance 2 minimum)`,
      )
      .max(
        SPOTIFY_CANVAS_MAX_DURATION_SECONDS,
        `durationSeconds must be <= ${SPOTIFY_CANVAS_MAX_DURATION_SECONDS} (Spotify Canvas maximum)`,
      ),
    mascotAppearanceMode: z.enum(MASCOT_APPEARANCE_MODES).default("discrete_gesture"),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .superRefine((canvas, ctx) => {
    if (!canvas.imageReferences.includes(canvas.loopAnchorReferenceName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["loopAnchorReferenceName"],
        message: `loopAnchorReferenceName "${canvas.loopAnchorReferenceName}" must also appear in imageReferences (so it can be used as a Seedance reference).`,
      });
    }
  });

const QualityChecksSchema = z
  .object({
    noTextOnScreen: z.boolean(),
    noLogoOrUrl: z.boolean(),
    noLipsyncToMusic: z.boolean(),
    mascotAppearsAtLeastOnce: z.boolean(),
    loopAnchorIsAlsoInImageReferences: z.boolean(),
    durationWithinSpotifyWindow: z.boolean(),
  })
  .strict();

export const SongCoverPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    albumCover: AlbumCoverSchema,
    spotifyCanvas: SpotifyCanvasSchema,
    qualityChecks: QualityChecksSchema,
  })
  .strict();

export type SongCoverPlan = z.infer<typeof SongCoverPlanSchema>;
export type SongCoverPlanAlbumCover = z.infer<typeof AlbumCoverSchema>;
export type SongCoverPlanSpotifyCanvas = z.infer<typeof SpotifyCanvasSchema>;
export type SongCoverPlanQualityChecks = z.infer<typeof QualityChecksSchema>;
export type MascotAppearanceMode = (typeof MASCOT_APPEARANCE_MODES)[number];

/**
 * Soft sanity check the app uses at sync time as a warning (NOT a hard
 * failure). The contract requires the Canvas prompt to declare the loop
 * anchor as both the first and last frame; if the agent forgot, we log
 * a warning so the operator can ask for a revision but we still upsert
 * the row so they can manually edit the prompt in the UI.
 *
 * The match is intentionally lenient: we look for an `@<canonicalName>`
 * token and any of the keywords `loop`, `first frame`, or `last frame`
 * somewhere in the prompt.
 */
export function isCanvasPromptMissingLoopInstruction(
  prompt: string,
  loopAnchorReferenceName: string,
): boolean {
  const promptLower = prompt.toLowerCase();
  const anchorMention = prompt.includes(`@${loopAnchorReferenceName}`);
  const loopKeyword =
    promptLower.includes("loop") ||
    promptLower.includes("first frame") ||
    promptLower.includes("last frame") ||
    promptLower.includes("seamless");
  return !(anchorMention && loopKeyword);
}
