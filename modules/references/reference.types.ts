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
