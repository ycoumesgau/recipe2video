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
  segmentReadiness: SegmentReferenceReadiness[];
}
