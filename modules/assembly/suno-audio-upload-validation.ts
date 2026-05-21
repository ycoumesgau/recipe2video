export const MAX_SUNO_AUDIO_BYTES = 50 * 1024 * 1024;

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

export interface SunoAudioFileDescriptor {
  name: string;
  size: number;
  type: string;
}

export function validateSunoAudioDescriptor(file: SunoAudioFileDescriptor) {
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

export function getFileExtension(filename: string) {
  return filename.split(".").at(-1)?.toLowerCase() ?? "";
}
