import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import type { ReferenceStatus } from "@/modules/references/reference-status";
import type { ConditioningAnchorPreview } from "@/modules/references/reference.types";
import type { RunwayTaskStatusValue } from "@/modules/generation/runway.types";

import type { MascotAppearanceMode } from "@/modules/recipe-agent/song-cover-plan.schema";

export type SongCoverArtifactKind = "album_cover" | "spotify_canvas";

/**
 * Domain row for the streaming-publication artifacts that drive the
 * Cover & Canvas tab. One row per `(video_id, kind)`. Driven by the
 * agent artifact `song-cover-plan.json` (per
 * `contracts/song-cover.md` in `recipe2video-agent-workspace`) and by
 * operator edits in the UI.
 */
export interface SongCoverArtifact {
  id: string;
  videoId: string;
  kind: SongCoverArtifactKind;
  prompt: string;
  imageReferenceCanonicalNames: string[];
  videoReferenceCanonicalNames: string[];
  loopAnchorReferenceName: string | null;
  durationSeconds: number | null;
  /**
   * Optional hint used by the UI when rendering the Canvas card. Persisted
   * for the operator's reference but not enforced by the generation
   * pipeline (the prompt itself drives the motion).
   */
  mascotAppearanceMode?: MascotAppearanceMode | null;
  status: ReferenceStatus;
  activeMediaAssetId: string | null;
  runwayTaskId: string | null;
  runwayTaskStatus: RunwayTaskStatusValue | null;
  runwayProgress: number | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSongCoverArtifactInput {
  videoId: string;
  kind: SongCoverArtifactKind;
  prompt: string;
  imageReferenceCanonicalNames: string[];
  videoReferenceCanonicalNames?: string[];
  loopAnchorReferenceName?: string | null;
  durationSeconds?: number | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface UpdateSongCoverArtifactInput {
  prompt?: string;
  imageReferenceCanonicalNames?: string[];
  videoReferenceCanonicalNames?: string[];
  loopAnchorReferenceName?: string | null;
  durationSeconds?: number | null;
  status?: ReferenceStatus;
  activeMediaAssetId?: string | null;
  runwayTaskId?: string | null;
  runwayTaskStatus?: RunwayTaskStatusValue | null;
  runwayProgress?: number | null;
  notes?: string | null;
}

export interface SongCoverArtifactVariant {
  mediaAsset: MediaAsset;
  previewUrl: string | null;
  isActive: boolean;
}

/**
 * Full review payload the Cover & Canvas page consumes. Mirrors the
 * shape used by the References review payload so both pages can reuse
 * the shared artifact-image-card shell without translation layers.
 */
/** Resolved preview for a canonical name on a song-cover artifact. */
export type SongCoverReferencePreview = ConditioningAnchorPreview & {
  kind: "image" | "video";
};

export interface SongCoverArtifactReview {
  artifact: SongCoverArtifact;
  mediaAsset?: MediaAsset | null;
  previewUrl?: string | null;
  variants: SongCoverArtifactVariant[];
  imageReferencePreviews: SongCoverReferencePreview[];
  videoReferencePreviews: SongCoverReferencePreview[];
  /**
   * Canonical names that failed to resolve against `asset_library` or
   * `reference_assets` for this video. Surfaced as warnings in the UI;
   * the artifact stays in the listing so the operator can fix the names
   * and regenerate.
   */
  unresolvedImageReferences: string[];
  unresolvedVideoReferences: string[];
}

export interface CoverAndCanvasPageData {
  albumCover: SongCoverArtifactReview | null;
  spotifyCanvas: SongCoverArtifactReview | null;
  /**
   * Set when the agent has never produced `song-cover-plan.json` for
   * this video. The page renders an empty state with a CTA that asks
   * the agent to plan publication assets via the `publication_planning`
   * stage.
   */
  hasAnyArtifact: boolean;
}
