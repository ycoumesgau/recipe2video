import type { ReferenceStatus } from "./reference-status";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";

export interface ReferenceAsset {
  id: string;
  videoId?: string | null;
  mediaAssetId?: string | null;
  type: string;
  canonicalName: string;
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
   * `asset_library` canonical_name or alias values to use as visual anchors
   * (`referenceImages[]`) when generating this recipe-specific reference
   * through `POST /v1/text_to_image`. Empty for library globals (their UI
   * card is read-only) and for recipe-specific entries whose agent plan did
   * not declare any conditioning. Resolved against the live library at
   * generation time so the agent's stored plan stays portable.
   */
  conditioningCanonicalNames?: string[];
  createdAt: string;
}

export interface ReferenceAssetReviewItem {
  reference: ReferenceAsset;
  mediaAsset?: MediaAsset | null;
  previewUrl?: string | null;
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
   * Library globals that will be passed to GPT-Image 2 as `referenceImages`
   * the next time this reference is generated. Resolved best-effort from
   * `reference.conditioningCanonicalNames`: unknown names appear in
   * `conditioningUnresolved` so the UI can warn the operator that an
   * anchor was dropped silently. Empty for library globals.
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
  /** Canonical name of the matched library entry (snake_case storage key). */
  canonicalName: string;
  /** Friendly @-handle the prompt mentions (e.g. `KitchenIslandDefault`). */
  tag: string;
  /**
   * Library category (`kitchen`, `character`, `utensil`, …) for grouping in
   * the UI without re-querying the library.
   */
  category: string;
  /**
   * Short-lived signed URL for the anchor preview. May be null when the
   * library entry has no stored media yet — the UI renders a placeholder
   * instead of a broken image.
   */
  previewUrl: string | null;
}

export interface SegmentReferenceReadiness {
  segmentId: string;
  segmentTitle: string;
  referenceCount: number;
  exceedsReferenceLimit: boolean;
  missingApprovedReferences: string[];
  missingRunwayUploads: string[];
}

export interface ReferenceReviewData {
  globalReferences: ReferenceAssetReviewItem[];
  recipeReferences: ReferenceAssetReviewItem[];
  rejectedReferences: ReferenceAssetReviewItem[];
  /**
   * References that are still `planned`, `generating`, `failed`, or that
   * do not yet have a `runwayUri`. Surfaces the work the user still has to
   * do before a Seedance generation can be launched.
   */
  missingReferences: ReferenceAssetReviewItem[];
  segmentReadiness: SegmentReferenceReadiness[];
}
