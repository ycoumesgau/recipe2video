import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import { listMediaAssetsByVideoId } from "@/modules/media-assets/repositories/media-asset.repository";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage-signed-url";
import { findAssetLibraryByCanonicalNames } from "@/modules/references/repositories/asset-library.repository";
import { listReferenceAssetsForVideo } from "@/modules/references/repositories/reference.repository";

import { listSongCoverArtifactsForVideo } from "../repositories/song-cover.repository";
import type {
  CoverAndCanvasPageData,
  SongCoverArtifact,
  SongCoverArtifactReview,
  SongCoverArtifactVariant,
} from "../song-cover.types";

const PREVIEW_TTL_SECONDS = 60 * 60;

export async function getCoverAndCanvasPageData(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<CoverAndCanvasPageData> {
  const [artifacts, mediaAssets, recipeRefs] = await Promise.all([
    listSongCoverArtifactsForVideo(supabase, videoId),
    listMediaAssetsByVideoId(supabase, videoId),
    listReferenceAssetsForVideo(supabase, videoId),
  ]);

  const albumCoverArtifact =
    artifacts.find((a) => a.kind === "album_cover") ?? null;
  const spotifyCanvasArtifact =
    artifacts.find((a) => a.kind === "spotify_canvas") ?? null;

  // Resolve library + recipe canonical names referenced across both
  // artifacts so the resolver runs in a single round-trip.
  const referencedNames = new Set<string>();
  for (const a of artifacts) {
    for (const n of a.imageReferenceCanonicalNames) referencedNames.add(n);
    for (const n of a.videoReferenceCanonicalNames) referencedNames.add(n);
  }
  const libraryIndex = await findAssetLibraryByCanonicalNames(
    supabase,
    Array.from(referencedNames),
  );
  const recipeRefNames = new Set(recipeRefs.map((r) => r.canonicalName));

  const albumCover = await buildReview(
    supabase,
    albumCoverArtifact,
    mediaAssets,
    libraryIndex,
    recipeRefNames,
  );
  const spotifyCanvas = await buildReview(
    supabase,
    spotifyCanvasArtifact,
    mediaAssets,
    libraryIndex,
    recipeRefNames,
  );

  return {
    albumCover,
    spotifyCanvas,
    hasAnyArtifact: artifacts.length > 0,
  };
}

async function buildReview(
  supabase: SupabaseDataClient,
  artifact: SongCoverArtifact | null,
  mediaAssets: MediaAsset[],
  libraryIndex: Awaited<ReturnType<typeof findAssetLibraryByCanonicalNames>>,
  recipeRefNames: Set<string>,
): Promise<SongCoverArtifactReview | null> {
  if (!artifact) return null;

  const expectedType =
    artifact.kind === "album_cover" ? "album_cover_image" : "spotify_canvas_video";

  const allVariants = mediaAssets
    .filter((m) => m.type === expectedType)
    .filter((m) => {
      if (!m.metadata || typeof m.metadata !== "object") return false;
      const metadata = m.metadata as Record<string, unknown>;
      return (
        metadata.songCoverArtifactId === artifact.id ||
        metadata.song_cover_artifact_id === artifact.id
      );
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const variants: SongCoverArtifactVariant[] = [];
  let previewUrl: string | null = null;
  let activeMediaAsset: MediaAsset | null = null;

  for (const m of allVariants) {
    const url = await signedUrlFor(supabase, m);
    const isActive = m.id === artifact.activeMediaAssetId;
    if (isActive) {
      previewUrl = url;
      activeMediaAsset = m;
    }
    variants.push({ mediaAsset: m, previewUrl: url, isActive });
  }

  // Surface unresolved canonical names so the UI can warn the operator.
  const unresolvedImageReferences = artifact.imageReferenceCanonicalNames.filter(
    (name) => !libraryIndex.has(name) && !recipeRefNames.has(name),
  );
  const unresolvedVideoReferences = artifact.videoReferenceCanonicalNames.filter(
    (name) => !libraryIndex.has(name) && !recipeRefNames.has(name),
  );

  return {
    artifact,
    mediaAsset: activeMediaAsset,
    previewUrl,
    variants,
    unresolvedImageReferences,
    unresolvedVideoReferences,
  };
}

async function signedUrlFor(
  supabase: SupabaseDataClient,
  asset: MediaAsset,
): Promise<string | null> {
  if (!asset.storageBucket || !asset.storagePath) return null;
  try {
    return await createStorageSignedUrl(supabase, {
      bucket: asset.storageBucket as MediaStorageBucket,
      path: asset.storagePath,
      expiresInSeconds: PREVIEW_TTL_SECONDS,
    });
  } catch {
    return null;
  }
}
