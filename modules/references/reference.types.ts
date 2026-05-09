import type { ReferenceStatus } from "./reference-status";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";

export interface ReferenceAsset {
  id: string;
  videoId?: string | null;
  mediaAssetId?: string | null;
  type: string;
  canonicalName: string;
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
