import "server-only";

import {
  MEDIA_ASSET_STORAGE_BUCKET_BY_TYPE,
} from "@/modules/media-assets/media-asset.constants";
import { insertStoredMediaAsset } from "@/modules/media-assets/repositories/media-asset.repository";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import { linkCompositionAudio } from "../repositories/assembly.repository";
import {
  type SunoAudioFileDescriptor,
  validateSunoAudioDescriptor,
} from "../suno-audio-upload-validation";

export interface CompleteSunoAudioUploadInput {
  supabase: SupabaseDataClient;
  videoId: string;
  storagePath: string;
  file: SunoAudioFileDescriptor;
  createdBy?: string | null;
}

export async function completeSunoAudioUpload(input: CompleteSunoAudioUploadInput) {
  validateSunoAudioDescriptor(input.file);
  assertSunoStoragePath(input.videoId, input.storagePath);

  const project = await getVideoProjectById(input.supabase, input.videoId);
  if (!project) {
    throw new Error("Video project not found.");
  }

  const bucket = MEDIA_ASSET_STORAGE_BUCKET_BY_TYPE.suno_audio;
  await assertStorageObjectExists(input.supabase, bucket, input.storagePath);

  const mediaAsset = await insertStoredMediaAsset(input.supabase, {
    videoId: input.videoId,
    type: "suno_audio",
    provider: "suno",
    storageBucket: bucket,
    storagePath: input.storagePath,
    originalFilename: input.file.name || "suno-audio.mp3",
    mimeType: input.file.type || null,
    fileSizeBytes: input.file.size,
    metadata: {
      source: "manual_suno_upload",
      uploadMethod: "signed_storage_url",
    },
    createdBy: input.createdBy ?? null,
  });

  const composition = await linkCompositionAudio(input.supabase, {
    videoId: input.videoId,
    audioMediaAssetId: mediaAsset.id,
    createdBy: input.createdBy ?? null,
  });

  return { mediaAsset, composition };
}

function assertSunoStoragePath(videoId: string, storagePath: string) {
  const prefix = `${videoId}/`;
  if (
    !storagePath.startsWith(prefix) ||
    storagePath.includes("..") ||
    storagePath.length <= prefix.length
  ) {
    throw new Error("Invalid Suno audio storage path.");
  }
}

async function assertStorageObjectExists(
  supabase: SupabaseDataClient,
  bucket: string,
  path: string,
) {
  const parent = path.split("/").slice(0, -1).join("/");
  const filename = path.split("/").at(-1);
  const { data, error } = await supabase.storage.from(bucket).list(parent, {
    limit: 100,
    search: filename,
  });

  if (error) {
    throw new Error(`Unable to verify Suno audio upload: ${error.message}`);
  }

  const found = (data ?? []).some((entry) => entry.name === filename);
  if (!found) {
    throw new Error(
      "Suno audio file was not found in storage. Retry the upload.",
    );
  }
}
