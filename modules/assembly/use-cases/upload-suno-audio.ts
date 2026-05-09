import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";

import { linkCompositionAudio } from "../repositories/assembly.repository";

const MAX_SUNO_AUDIO_BYTES = 50 * 1024 * 1024;

const ALLOWED_SUNO_AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/flac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
]);

const ALLOWED_SUNO_AUDIO_EXTENSIONS = new Set([
  "aac",
  "flac",
  "mp3",
  "wav",
]);

export async function uploadSunoAudio(input: {
  supabase: SupabaseDataClient;
  videoId: string;
  file: File;
  createdBy?: string | null;
}) {
  validateSunoAudioFile(input.file);

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

function validateSunoAudioFile(file: File) {
  if (!file.size) {
    throw new Error("Choose a non-empty Suno audio file before uploading.");
  }

  if (file.size > MAX_SUNO_AUDIO_BYTES) {
    throw new Error("Suno audio upload must be 50 MB or smaller.");
  }

  const mimeTypeAllowed =
    file.type.length > 0 && ALLOWED_SUNO_AUDIO_MIME_TYPES.has(file.type);
  const extensionAllowed = ALLOWED_SUNO_AUDIO_EXTENSIONS.has(
    getFileExtension(file.name),
  );

  if (!mimeTypeAllowed && !extensionAllowed) {
    throw new Error("Upload a Suno audio file as MP3, WAV, AAC, or FLAC.");
  }
}

function getFileExtension(filename: string) {
  return filename.split(".").at(-1)?.toLowerCase() ?? "";
}
