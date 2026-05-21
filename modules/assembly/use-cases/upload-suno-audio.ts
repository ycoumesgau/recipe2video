import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";

import { linkCompositionAudio } from "../repositories/assembly.repository";
import { validateSunoAudioDescriptor } from "../suno-audio-upload-validation";

export async function uploadSunoAudio(input: {
  supabase: SupabaseDataClient;
  videoId: string;
  file: File;
  createdBy?: string | null;
}) {
  validateSunoAudioDescriptor({
    name: input.file.name,
    size: input.file.size,
    type: input.file.type,
  });

  const project = await getVideoProjectById(input.supabase, input.videoId);
  if (!project) {
    throw new Error("Video project not found.");
  }

  const mediaAsset = await persistMediaAssetFile({
    supabase: input.supabase,
    type: "suno_audio",
    provider: "suno",
    body: input.file,
    videoId: input.videoId,
    originalFilename: input.file.name || "suno-audio.mp3",
    mimeType: input.file.type || null,
    fileSizeBytes: input.file.size,
    createdBy: input.createdBy ?? null,
    metadata: {
      source: "manual_suno_upload",
    },
  });

  const composition = await linkCompositionAudio(input.supabase, {
    videoId: input.videoId,
    audioMediaAssetId: mediaAsset.id,
    createdBy: input.createdBy ?? null,
  });

  return { mediaAsset, composition };
}
