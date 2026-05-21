import "server-only";

import {
  MEDIA_ASSET_STORAGE_BUCKET_BY_TYPE,
  MEDIA_STORAGE_BUCKETS,
} from "@/modules/media-assets/media-asset.constants";
import { buildMediaStoragePath } from "@/modules/media-assets/storage-paths";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import {
  type SunoAudioFileDescriptor,
  validateSunoAudioDescriptor,
} from "../suno-audio-upload-validation";

export interface PrepareSunoAudioUploadInput {
  supabase: SupabaseDataClient;
  videoId: string;
  file: SunoAudioFileDescriptor;
}

export interface PrepareSunoAudioUploadResult {
  bucket: typeof MEDIA_STORAGE_BUCKETS.sunoAudio;
  storagePath: string;
  signedUrl: string;
  token: string;
}

export async function prepareSunoAudioUpload(
  input: PrepareSunoAudioUploadInput,
): Promise<PrepareSunoAudioUploadResult> {
  validateSunoAudioDescriptor(input.file);

  const project = await getVideoProjectById(input.supabase, input.videoId);
  if (!project) {
    throw new Error("Video project not found.");
  }

  const storageFilename = `${Date.now()}-${input.file.name || "suno-audio.mp3"}`;
  const storagePath = buildMediaStoragePath({
    type: "suno_audio",
    videoId: input.videoId,
    filename: storageFilename,
  });
  const bucket = MEDIA_ASSET_STORAGE_BUCKET_BY_TYPE.suno_audio;

  const { data, error } = await input.supabase.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.signedUrl || !data.token) {
    throw new Error(
      `Unable to prepare Suno audio upload: ${error?.message ?? "missing signed URL"}`,
    );
  }

  return {
    bucket,
    storagePath: data.path ?? storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
  };
}
