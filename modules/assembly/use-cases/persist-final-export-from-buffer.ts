import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import { MEDIA_STORAGE_BUCKETS } from "@/modules/media-assets/media-asset.constants";
import { insertStoredMediaAsset } from "@/modules/media-assets/repositories/media-asset.repository";
import { uploadStorageObject } from "@/modules/media-assets/services/storage.service";
import { buildMediaStoragePath } from "@/modules/media-assets/storage-paths";
import { uploadMediaAssetToMux } from "@/modules/media-assets/use-cases/upload-media-asset-to-mux";
import { updateVideoProjectStatus } from "@/modules/videos/repositories/video.repository";

import type {
  AssemblyRemotionProps,
  AssemblyTimelineState,
  SegmentPlacement,
} from "../assembly.types";
import { updateCompositionExport } from "../repositories/assembly.repository";

export interface PersistFinalExportFromBufferInput {
  supabase: SupabaseDataClient;
  videoId: string;
  compositionId: string;
  createdBy: string;
  mp4Buffer: Buffer;
  placements: SegmentPlacement[];
  timelineState: AssemblyTimelineState;
  remotionProps: AssemblyRemotionProps;
  source: "assembly_sandbox_render" | "assembly_final_export_upload";
}

export async function persistFinalExportFromBuffer(
  input: PersistFinalExportFromBufferInput,
) {
  const filename = `assembly-${input.compositionId}.mp4`;
  const storagePath = buildMediaStoragePath({
    type: "final_export",
    videoId: input.videoId,
    compositionId: input.compositionId,
    filename,
    mimeType: "video/mp4",
  });

  await uploadStorageObject(input.supabase, {
    bucket: MEDIA_STORAGE_BUCKETS.finalExports,
    path: storagePath,
    body: input.mp4Buffer,
    contentType: "video/mp4",
  });

  const mediaAsset = await insertStoredMediaAsset(input.supabase, {
    videoId: input.videoId,
    type: "final_export",
    provider: "supabase",
    storageBucket: MEDIA_STORAGE_BUCKETS.finalExports,
    storagePath,
    originalFilename: filename,
    mimeType: "video/mp4",
    fileSizeBytes: input.mp4Buffer.byteLength,
    status: "stored",
    metadata: {
      compositionId: input.compositionId,
      placements: input.placements,
      timelineState: input.timelineState,
      source: input.source,
    },
    createdBy: input.createdBy,
  });

  const muxResult = await uploadMediaAssetToMux(mediaAsset.id);

  await updateCompositionExport(input.supabase, {
    compositionId: input.compositionId,
    exportMediaAssetId: mediaAsset.id,
    exportStatus: "completed",
    remotionProps: input.remotionProps,
  });
  await updateVideoProjectStatus(input.supabase, input.videoId, "exported");

  return { mediaAssetId: mediaAsset.id, muxPlaybackId: muxResult.muxPlaybackId };
}
