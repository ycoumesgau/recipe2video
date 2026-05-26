import type { ReferenceStatus } from "./reference-status";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import type { RunwayTaskStatusValue } from "@/modules/generation/runway.types";

/**
 * Provenance of a recipe-specific reference asset.
 *
 *   - `generated_image`: produced by GPT-Image 2 from a planner-authored prompt.
 *   - `extracted_frame`: a single PNG frame extracted from a previously-rendered
 *     segment via Mux thumbnail; carries `sourceSegmentId` + timestamp.
 *   - `external_image`: uploaded by the operator outside the planner flow.
 *   - `extracted_frame_pending`: placeholder declared by the planner that
 *     points at an upstream segment whose render is not yet available; the
 *     orchestrator blocks downstream generation until the operator extracts
 *     the frame and the row is upgraded to `extracted_frame`.
 */
export type ReferenceAssetKind =
  | "generated_image"
  | "extracted_frame"
  | "external_image"
  | "extracted_frame_pending";

export interface ReferenceAsset {
  id: string;
  videoId?: string | null;
  mediaAssetId?: string | null;
  type: string;
  canonicalName: string;
  /** See `ReferenceAssetKind`. Falls back to `generated_image` for legacy rows. */
  kind?: ReferenceAssetKind;
  /** UUID of the segment whose render the frame was extracted from. */
  sourceSegmentId?: string | null;
  /** Timestamp (in seconds) of the extracted frame inside the source segment. */
  sourceTimestampSeconds?: number | null;
  /**
   * Alternative names. Library globals expose every `asset_library.aliases`
   * entry here so the matcher can recognize a segment that declared the
   * reference via its alias (`KitchenIslandDefault`) even though the
   * canonical is the snake_case storage name (`island_default`). Recipe-
   * specific entries leave this empty.
   */
  aliases?: string[];
  source: string;
  runwayUri?: string | null;
  prompt?: string | null;
  status: ReferenceStatus;
  /**
   * Canonical names to use as visual anchors (`referenceImages[]`) when
   * generating this recipe-specific reference through `POST /v1/text_to_image`.
   * Each name resolves against the global `asset_library` first, then against
   * other `reference_assets` on the same video that already have stored media.
   * Empty for library globals (read-only cards) and when no conditioning is
   * declared.
   */
  conditioningCanonicalNames?: string[];
  createdAt: string;
  /** Set while a Runway `text_to_image` task is polled for this recipe row. */
  runwayTaskId?: string | null;
  runwayTaskStatus?: RunwayTaskStatusValue | null;
  runwayProgress?: number | null;
}

export interface ReferenceImageVariantItem {
  mediaAsset: MediaAsset;
  previewUrl: string | null;
  isActive: boolean;
}

export interface ReferenceAssetReviewItem {
  reference: ReferenceAsset;
  mediaAsset?: MediaAsset | null;
  previewUrl?: string | null;
  /**
   * Historical GPT-Image 2 / manual uploads for this reference, newest first.
   * Lets the operator compare regenerations before approving one.
   */
  imageVariants?: ReferenceImageVariantItem[];
  usedInSegments: string[];
  /**
   * True when the reference comes from the global `asset_library`. Library
   * entries are synthesized into a ReferenceAsset shape for UI uniformity,
   * but they must NOT expose approve/reject/regenerate/upload actions on the
   * per-video references page: those would silently mutate global state. The
   * library is owned by the dedicated /library admin page.
   */
  isLibraryGlobal?: boolean;
  /**
   * Library globals and recipe-specific frames that will be passed to
   * GPT-Image 2 as `referenceImages` the next time this reference is generated.
   * Unknown names appear in `conditioningUnresolved`. Empty for library globals.
   */
  conditioningAnchors?: ConditioningAnchorPreview[];
  conditioningUnresolved?: string[];
  /**
   * Library entries that DID resolve but were dropped on purpose because
   * their category is excluded by the recipe-state conditioning policy
   * (currently: the mascot character sheet and any pose/expression
   * variant — the kitchen already carries the Licorn visual identity).
   * Surfaced so the UI can show "these were skipped intentionally,
   * that's not a typo".
   */
  conditioningExcluded?: Array<{
    canonicalName: string;
    category: string;
  }>;
}

export interface ConditioningAnchorPreview {
  /** Canonical name of the matched anchor. */
  canonicalName: string;
  /** Friendly @-handle the prompt mentions (e.g. `KitchenIslandDefault`). */
  tag: string;
  /**
   * Library category or recipe reference `type` (`recipe_state`, …) for the
   * preview card subtitle.
   */
  category: string;
  /** Global library entry vs another frame generated on this video. */
  source: "asset_library" | "reference_assets";
  /**
   * Short-lived signed URL for the anchor preview. May be null when the
   * library entry has no stored media yet — the UI renders a placeholder
   * instead of a broken image.
   */
  previewUrl: string | null;
  /**
   * When set, the thumbnail grid renders a muted video preview instead of an
   * image (Spotify Canvas video references).
   */
  kind?: "image" | "video";
}

export interface SegmentReferenceReadiness {
  segmentId: string;
  segmentTitle: string;
  referenceCount: number;
  exceedsReferenceLimit: boolean;
  missingApprovedReferences: string[];
  missingRunwayUploads: string[];
}

export interface ReferenceSubstitutePickerOption {
  pickerKey: string;
  libraryAssetId: string | null;
  recipeReferenceId: string | null;
  canonicalName: string;
  label: string;
  source: "asset_library" | "reference_assets";
  isLibraryGlobal: boolean;
}

export interface ReferenceReviewData {
  globalReferences: ReferenceAssetReviewItem[];
  recipeReferences: ReferenceAssetReviewItem[];
  rejectedReferences: ReferenceAssetReviewItem[];
  /** Library globals + recipe-specific assets available for substitution. */
  substitutePickerOptions: ReferenceSubstitutePickerOption[];
  /**
   * References that are still `planned`, `generating`, `failed`, or that
   * do not yet have a `runwayUri`. Surfaces the work the user still has to
   * do before a Seedance generation can be launched.
   */
  missingReferences: ReferenceAssetReviewItem[];
  segmentReadiness: SegmentReferenceReadiness[];
}
