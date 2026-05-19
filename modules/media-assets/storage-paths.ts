import type { MediaAssetType } from "./media-asset.types";

type StoragePathInput =
  | {
      type: "recipe_source";
      videoId: string;
      filename: string;
    }
  | {
      type: "reference_image";
      videoId: string;
      referenceId: string;
      /**
       * Unique id per generation attempt. When omitted, uses the legacy
       * flat path `{videoId}/{referenceId}.ext` (read-only for old rows).
       */
      variantId?: string | null;
      filename?: string | null;
      mimeType?: string | null;
    }
  | {
      type: "runway_output" | "accepted_clip";
      videoId: string;
      segmentId: string;
      generationId: string;
      filename?: string | null;
      mimeType?: string | null;
    }
  | {
      type: "suno_audio";
      videoId: string;
      filename: string;
    }
  | {
      type: "final_export";
      videoId: string;
      compositionId: string;
      filename?: string | null;
      mimeType?: string | null;
    };

const DEFAULT_EXTENSION_BY_TYPE: Record<MediaAssetType, string> = {
  recipe_source: "bin",
  reference_image: "png",
  runway_output: "mp4",
  accepted_clip: "mp4",
  suno_audio: "mp3",
  final_export: "mp4",
};

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/x-wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function buildMediaStoragePath(input: StoragePathInput): string {
  switch (input.type) {
    case "recipe_source":
      return `${input.videoId}/${sanitizeStorageFileName(input.filename)}`;
    case "reference_image": {
      const extension = getStorageFileExtension({
        type: input.type,
        filename: input.filename,
        mimeType: input.mimeType,
      });
      if (input.variantId) {
        return `${input.videoId}/${input.referenceId}/${input.variantId}.${extension}`;
      }
      return `${input.videoId}/${input.referenceId}.${extension}`;
    }
    case "runway_output":
    case "accepted_clip":
      return `${input.videoId}/${input.segmentId}/${
        input.generationId
      }.${getStorageFileExtension({
        type: input.type,
        filename: input.filename,
        mimeType: input.mimeType,
      })}`;
    case "suno_audio":
      return `${input.videoId}/${sanitizeStorageFileName(input.filename)}`;
    case "final_export":
      return `${input.videoId}/${input.compositionId}.${getStorageFileExtension({
        type: input.type,
        filename: input.filename,
        mimeType: input.mimeType,
      })}`;
  }
}

export function getStorageFileExtension(input: {
  type: MediaAssetType;
  filename?: string | null;
  mimeType?: string | null;
}) {
  const filenameExtension = input.filename?.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  if (filenameExtension) {
    return filenameExtension.toLowerCase();
  }

  if (input.mimeType && EXTENSION_BY_MIME_TYPE[input.mimeType]) {
    return EXTENSION_BY_MIME_TYPE[input.mimeType];
  }

  return DEFAULT_EXTENSION_BY_TYPE[input.type];
}

export function sanitizeStorageFileName(filename: string) {
  return (
    filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "media-file"
  );
}
