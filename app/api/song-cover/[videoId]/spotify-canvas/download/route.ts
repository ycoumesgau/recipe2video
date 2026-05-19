import { NextResponse } from "next/server";

import { assertCostlyActionAllowed } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getMediaAssetById } from "@/modules/media-assets/repositories/media-asset.repository";
import { downloadStorageObject } from "@/modules/media-assets/services/storage.service";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import { getSongCoverArtifactForVideoByKind } from "@/modules/song-cover/repositories/song-cover.repository";

/**
 * Stream the active Spotify Canvas MP4 as a download. Runway already
 * produces a conformant H.264 MP4 at 1080:1920 for Seedance 2, so no
 * re-encode is required at download time. If a future Runway response
 * lands in a non-MP4 container we will add a `ffmpeg -c copy` remux
 * step here (cheap, no quality loss) — flagged in PR-E polish.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ videoId: string }> },
): Promise<Response> {
  const { videoId } = await context.params;

  await assertCostlyActionAllowed();

  const supabase = createSupabaseAdminClient();
  const artifact = await getSongCoverArtifactForVideoByKind(
    supabase,
    videoId,
    "spotify_canvas",
  );
  if (!artifact) {
    return NextResponse.json(
      { error: "No Spotify Canvas planned for this video." },
      { status: 404 },
    );
  }
  if (!artifact.activeMediaAssetId) {
    return NextResponse.json(
      { error: "Spotify Canvas has no generated variant yet." },
      { status: 409 },
    );
  }

  const mediaAsset = await getMediaAssetById(supabase, artifact.activeMediaAssetId);
  if (!mediaAsset || !mediaAsset.storageBucket || !mediaAsset.storagePath) {
    return NextResponse.json(
      { error: "Active Spotify Canvas media asset is missing storage info." },
      { status: 500 },
    );
  }

  const blob = await downloadStorageObject(supabase, {
    bucket: mediaAsset.storageBucket as MediaStorageBucket,
    path: mediaAsset.storagePath,
  });
  const arrayBuffer = await blob.arrayBuffer();

  const filename = `spotify-canvas-${videoId}.mp4`;
  return new Response(new Uint8Array(arrayBuffer), {
    headers: {
      "content-type": mediaAsset.mimeType ?? "video/mp4",
      "content-length": String(arrayBuffer.byteLength),
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
