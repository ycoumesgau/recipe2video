import type {
  SeedanceSegment,
  SegmentReference,
} from "../storyboard.types";

/**
 * Canonical contract for the standardized Licorn celebration outro
 * segment. The agent (running in `recipe2video-agent-workspace`) emits
 * the outro segment with `prompt: "<APP_OVERRIDE>"`; the sync use-case
 * rewrites the prompt and references to the values produced by this
 * module. The agent never authors outro content directly.
 *
 * Scope:
 *   * Exactly one outro segment per video, always at the highest position.
 *   * Hard duration of 5s (Seedance 2 minimum).
 *   * Exactly 5 references in fixed order: structural kitchen, active
 *     framing, video motion ancre, character identity lock, recipe-
 *     specific finished dish.
 *   * Static dish in the foreground, character explosion behind the
 *     island. No food-porn destructive action inside the outro.
 *
 * Why a hard-coded template:
 *   * Production has shipped 10+ outros with LLM-written prompts; every
 *     one renders differently and dilutes the brand.
 *   * Standardizing the prompt is the cheapest way to guarantee an
 *     identical celebration beat across recipes while still letting
 *     Seedance improve animation quality over the 3s CapCut reference.
 */
export const LICORN_OUTRO_ARC = "licorn_celebration_outro";
export const LICORN_OUTRO_DURATION_SECONDS = 5;
export const LICORN_OUTRO_PROMPT_PLACEHOLDER = "<APP_OVERRIDE>";

/**
 * Canonical names of the 5 references the outro segment binds. The
 * order matches the slot order Seedance reads positionally; the sync
 * code uses these names verbatim when persisting `segment_references`.
 */
export const LICORN_OUTRO_REFERENCE_NAMES = {
  kitchenLayoutContextWide: "KitchenLayoutContextWide",
  kitchenIslandDefault: "KitchenIslandDefault",
  licornOutroVideo: "LicornOutroVideo",
  characterSheet: "CharacterSheet",
  finalDishVisual: "FinalDishVisual",
} as const;

export interface OutroTemplateInput {
  /**
   * Short, single-sentence description of the finished dish used to
   * ground Seedance on `@FinalDishVisual`. Must be neutral, dish-only,
   * no character, no action, no setup. Example: "a glossy plated
   * paris-brest crowned with caramelized hazelnut praline".
   */
  finalDishDescription: string;
}

/**
 * Builds the canonical outro reference list. Order is the contract;
 * the sync use-case does not reorder before persisting.
 *
 * `runwayUri` and `mediaAssetId` are intentionally null: the resolver
 * mints fresh signed URLs at generation time from the linked
 * `asset_library` / `reference_assets` rows.
 */
export function buildOutroReferences(): SegmentReference[] {
  return [
    {
      role: "structural kitchen context",
      name: LICORN_OUTRO_REFERENCE_NAMES.kitchenLayoutContextWide,
      label: LICORN_OUTRO_REFERENCE_NAMES.kitchenLayoutContextWide,
      runwayUri: null,
      mediaAssetId: null,
      required: true,
    },
    {
      role: "active hero island view",
      name: LICORN_OUTRO_REFERENCE_NAMES.kitchenIslandDefault,
      label: LICORN_OUTRO_REFERENCE_NAMES.kitchenIslandDefault,
      runwayUri: null,
      mediaAssetId: null,
      required: true,
    },
    {
      role: "Licorn celebration motion reference",
      name: LICORN_OUTRO_REFERENCE_NAMES.licornOutroVideo,
      label: LICORN_OUTRO_REFERENCE_NAMES.licornOutroVideo,
      runwayUri: null,
      mediaAssetId: null,
      required: true,
    },
    {
      role: "Licorn character identity lock",
      name: LICORN_OUTRO_REFERENCE_NAMES.characterSheet,
      label: LICORN_OUTRO_REFERENCE_NAMES.characterSheet,
      runwayUri: null,
      mediaAssetId: null,
      required: true,
    },
    {
      role: "finished dish identity",
      name: LICORN_OUTRO_REFERENCE_NAMES.finalDishVisual,
      label: LICORN_OUTRO_REFERENCE_NAMES.finalDishVisual,
      runwayUri: null,
      mediaAssetId: null,
      required: true,
    },
  ];
}

/**
 * Builds the canonical Seedance prompt for the outro segment.
 *
 * Static dish in the foreground, motionless from start to end.
 * Character starts calm behind the island for 1s, then hard cut to a
 * 4s explosion of joy with a vertical rainbow burst. The dish never
 * moves and never gets touched.
 */
export function buildOutroPrompt(input: OutroTemplateInput): string {
  const dish = sanitizeDishDescription(input.finalDishDescription);

  return [
    `Use @${LICORN_OUTRO_REFERENCE_NAMES.kitchenLayoutContextWide} for structural kitchen context.`,
    `Use @${LICORN_OUTRO_REFERENCE_NAMES.kitchenIslandDefault} as the active hero island view.`,
    `Use @${LICORN_OUTRO_REFERENCE_NAMES.licornOutroVideo} as REQUIRED motion reference: the same character starts calm behind the kitchen island, then explodes with joy mid-air with a vertical rainbow burst behind her. Match the energy and beats of this reference; do not redesign the character. You may improve animation quality.`,
    `Use @${LICORN_OUTRO_REFERENCE_NAMES.characterSheet} to lock the unicorn identity (white hoodie, pink ponytail, single horn). Do not redesign the character.`,
    `Use @${LICORN_OUTRO_REFERENCE_NAMES.finalDishVisual} as the finished dish identity: ${dish}. Place it intact on the foreground countertop. The dish does not move, is not touched, and does not change inside the segment.`,
    "",
    "Generate exactly 2 hard-cut shots, total duration 5 seconds, 9:16 vertical, no slow motion, no soft transitions, no extra shots, no text on screen.",
    "",
    "Mandatory timing:",
    "- 0.0 to 1.0s: finished dish sits intact in the foreground on the kitchen island countertop. The Licorn is visible behind the island, calm, smiling, arms relaxed at her sides.",
    "- 1.0 to 5.0s: hard cut. The Licorn explodes with joy mid-air: both fists raised, vertical rainbow background, eyes squinted with happiness. Same character identity as the reference video and the character sheet. The dish remains intact in the foreground, unchanged, untouched.",
    "",
    "Continuity lock: dish state is identical to the end of the previous segment. The dish does not move, is not touched, and does not change inside this segment. Zero interaction between the character and the dish.",
    "",
    "Integrated audio: no speech, no voiceover, no music. Only quiet kitchen ambience plus a soft whoosh at 1.0s and a celebratory tada burst from 1.0 to 2.0s.",
    "",
    "Global negatives: no text, no captions, no music, no speech, no voiceover, no character touching the dish, no spoon in the dish, no missing portion, no dish modification, no kitchen redesign, no licorn hiding the dish, no character redesign, no other species, no extra shots.",
  ].join("\n");
}

/**
 * Returns true if `segment.arc` matches the outro contract (case-insensitive,
 * tolerates surrounding whitespace). Used by the sync use-case and by the
 * orchestrator to detect the segment that should run through the canonical
 * template instead of the agent-authored prompt.
 */
export function isOutroSegment(segment: { arc?: string | null }): boolean {
  const arc = (segment.arc ?? "").trim().toLowerCase();
  return arc === LICORN_OUTRO_ARC;
}

export interface OutroOverrideResult {
  segments: SeedanceSegment[];
  errors: string[];
}

/**
 * Walks the agent-emitted segments and, for any segment marked as the
 * standardized outro (`arc === LICORN_OUTRO_ARC`), rewrites:
 *
 *   * `prompt` and `promptInitial` to the canonical outro prompt;
 *   * `references` to the canonical 5-entry outro reference list;
 *   * `durationTarget` to 5 (Seedance 2 minimum).
 *
 * The `finalDishDescription` is sourced from
 * `reference-plan.json[FinalDishVisual].prompt`. If the entry is missing
 * or has an empty prompt, the override is skipped for that segment and
 * an actionable error is appended to `errors` so the sync surfaces the
 * problem in the validation envelope.
 *
 * Pure function: no IO, safe to unit-test against fixtures.
 */
export function applyOutroOverrideToSegments(input: {
  segments: SeedanceSegment[];
  finalDishDescription: string | null;
}): OutroOverrideResult {
  const errors: string[] = [];

  const overridden = input.segments.map((segment) => {
    if (!isOutroSegment(segment)) {
      return segment;
    }

    if (!input.finalDishDescription || input.finalDishDescription.trim().length === 0) {
      errors.push(
        `seedance-segments.json: segment '${segment.id || segment.title || "(no id)"}' is marked as the standardized outro (arc=${LICORN_OUTRO_ARC}) but reference-plan.json has no FinalDishVisual entry with a non-empty prompt describing the finished dish. Add a FinalDishVisual reference (recipe-specific) before retrying.`,
      );
      return segment;
    }

    let prompt: string;
    try {
      prompt = buildOutroPrompt({ finalDishDescription: input.finalDishDescription });
    } catch (error) {
      errors.push(
        `seedance-segments.json: failed to build canonical outro prompt for segment '${segment.id || segment.title || "(no id)"}': ${error instanceof Error ? error.message : String(error)}`,
      );
      return segment;
    }

    return {
      ...segment,
      arc: LICORN_OUTRO_ARC,
      prompt,
      promptInitial: prompt,
      references: buildOutroReferences(),
      durationTarget: LICORN_OUTRO_DURATION_SECONDS,
    };
  });

  return { segments: overridden, errors };
}

function sanitizeDishDescription(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(
      "buildOutroPrompt: finalDishDescription must be a non-empty single-sentence dish description.",
    );
  }
  if (trimmed.length > 280) {
    throw new Error(
      `buildOutroPrompt: finalDishDescription is ${trimmed.length} chars; keep it under 280 to avoid bloating the outro prompt.`,
    );
  }
  return trimmed.replace(/\s+/g, " ");
}
