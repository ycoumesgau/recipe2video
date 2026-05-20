import { NextResponse } from "next/server";
import sharp from "sharp";

import { assertCostlyActionAllowed } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getMediaAssetById } from "@/modules/media-assets/repositories/media-asset.repository";
import { downloadStorageObject } from "@/modules/media-assets/services/storage.service";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import { getSongCoverArtifactForVideoByKind } from "@/modules/song-cover/repositories/song-cover.repository";

/**
 * Download the album cover at 3000x3000 JPEG.
 *
 * The Runway output is stored at `2048:2048` (2K tier). Distributors
 * require 3000x3000 minimum, so we upscale on the fly with sharp using
 * `lanczos3` resampling.
 *
 * No file is re-stored: the upscale is cheap and the source is already
 * kept in the `album-covers` bucket.
 */
const FINAL_EDGE_PX = 3000;
const JPEG_QUALITY = 95;

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
    "album_cover",
  );
  if (!artifact) {
    return NextResponse.json(
      { error: "No album cover planned for this video." },
      { status: 404 },
    );
  }
  if (!artifact.activeMediaAssetId) {
    return NextResponse.json(
      { error: "Album cover has no generated variant yet." },
      { status: 409 },
    );
  }

  const mediaAsset = await getMediaAssetById(supabase, artifact.activeMediaAssetId);
  if (!mediaAsset || !mediaAsset.storageBucket || !mediaAsset.storagePath) {
    return NextResponse.json(
      { error: "Active album cover media asset is missing storage info." },
      { status: 500 },
    );
  }

  const blob = await downloadStorageObject(supabase, {
    bucket: mediaAsset.storageBucket as MediaStorageBucket,
    path: mediaAsset.storagePath,
  });
  const arrayBuffer = await blob.arrayBuffer();

  const upscaled = await sharp(Buffer.from(arrayBuffer))
    .resize(FINAL_EDGE_PX, FINAL_EDGE_PX, {
      fit: "cover",
      kernel: "lanczos3",
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  const filename = `album-cover-${videoId}.jpg`;
  return new Response(new Uint8Array(upscaled), {
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(upscaled.byteLength),
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
