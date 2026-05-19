import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import {
  MEDIA_ASSET_STORAGE_BUCKET_BY_TYPE,
} from "../media-asset.constants";
import type {
  MediaAsset,
  MediaAssetProvider,
  MediaAssetType,
} from "../media-asset.types";
import { insertStoredMediaAsset } from "../repositories/media-asset.repository";
import {
  type StorageUploadBody,
  uploadStorageObject,
} from "../services/storage.service";
import { buildMediaStoragePath } from "../storage-paths";

export interface PersistMediaAssetFileInput {
  supabase: SupabaseDataClient;
  type: MediaAssetType;
  provider?: MediaAssetProvider;
  body: StorageUploadBody;
  videoId?: string | null;
  segmentId?: string | null;
  generationId?: string | null;
  referenceId?: string | null;
  /** Per-generation suffix for recipe reference images (avoids Storage collisions). */
  referenceVariantId?: string | null;
  compositionId?: string | null;
  storageFilename?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  runwayOutputUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
  upsert?: boolean;
}

export async function persistMediaAssetFile(
  input: PersistMediaAssetFileInput,
): Promise<MediaAsset> {
  const bucket = MEDIA_ASSET_STORAGE_BUCKET_BY_TYPE[input.type];
  const storagePath = buildStoragePath(input);

  await uploadStorageObject(input.supabase, {
    bucket,
    path: storagePath,
    body: input.body,
    contentType: input.mimeType,
    upsert: input.upsert,
  });

  return insertStoredMediaAsset(input.supabase, {
    videoId: input.videoId ?? null,
    segmentId: input.segmentId ?? null,
    generationId: input.generationId ?? null,
    type: input.type,
    provider: input.provider ?? getDefaultProvider(input.type),
    storageBucket: bucket,
    storagePath,
    runwayOutputUrl: input.runwayOutputUrl ?? null,
    originalFilename: input.originalFilename ?? null,
    mimeType: input.mimeType ?? null,
    fileSizeBytes: input.fileSizeBytes ?? getUploadBodySize(input.body),
    durationSeconds: input.durationSeconds ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    metadata: input.metadata ?? {},
    createdBy: input.createdBy ?? null,
  });
}

function getDefaultProvider(type: MediaAssetType): MediaAssetProvider {
  if (type === "runway_output") {
    return "runway";
  }

  if (type === "suno_audio") {
    return "suno";
  }

  return "supabase";
}

export async function persistRunwayOutput(input: {
  supabase: SupabaseDataClient;
  outputUrl: string;
  videoId: string;
  segmentId: string;
  generationId: string;
  createdBy?: string | null;
  originalFilename?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<MediaAsset> {
  const downloaded = await downloadRemoteMedia(input.outputUrl);

  return persistMediaAssetFile({
    supabase: input.supabase,
    type: "runway_output",
    body: downloaded.blob,
    videoId: input.videoId,
    segmentId: input.segmentId,
    generationId: input.generationId,
    originalFilename: input.originalFilename ?? downloaded.filename,
    mimeType: downloaded.mimeType,
    fileSizeBytes: downloaded.blob.size,
    runwayOutputUrl: input.outputUrl,
    createdBy: input.createdBy ?? null,
    metadata: {
      source: "runway_output_url",
      ...(input.metadata ?? {}),
    },
  });
}

function buildStoragePath(input: PersistMediaAssetFileInput): string {
  const videoId = requireValue(input.videoId, "videoId");

  switch (input.type) {
    case "recipe_source":
      return buildMediaStoragePath({
        type: input.type,
        videoId,
        filename: requireValue(
          input.storageFilename ?? input.originalFilename,
          "originalFilename",
        ),
      });
    case "reference_image":
      return buildMediaStoragePath({
        type: input.type,
        videoId,
        referenceId: requireValue(input.referenceId, "referenceId"),
        variantId: input.referenceVariantId ?? null,
        filename: input.originalFilename,
        mimeType: input.mimeType,
      });
    case "runway_output":
    case "accepted_clip":
      return buildMediaStoragePath({
        type: input.type,
        videoId,
        segmentId: requireValue(input.segmentId, "segmentId"),
        generationId: requireValue(input.generationId, "generationId"),
        filename: input.originalFilename,
        mimeType: input.mimeType,
      });
    case "suno_audio":
      return buildMediaStoragePath({
        type: input.type,
        videoId,
        filename: requireValue(
          input.storageFilename ?? input.originalFilename,
          "originalFilename",
        ),
      });
    case "final_export":
      return buildMediaStoragePath({
        type: input.type,
        videoId,
        compositionId: requireValue(input.compositionId, "compositionId"),
        filename: input.originalFilename,
        mimeType: input.mimeType,
      });
  }
}

async function downloadRemoteMedia(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Unable to download Runway output: ${response.status} ${response.statusText}`,
    );
  }

  const blob = await response.blob();

  return {
    blob,
    mimeType: response.headers.get("content-type"),
    filename: getFilenameFromUrl(url),
  };
}

function getFilenameFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").filter(Boolean).at(-1);
    return filename || "runway-output.mp4";
  } catch {
    return "runway-output.mp4";
  }
}

function getUploadBodySize(body: StorageUploadBody): number | null {
  if (
    typeof body === "object" &&
    body !== null &&
    "size" in body &&
    typeof body.size === "number"
  ) {
    return body.size;
  }

  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }

  if (ArrayBuffer.isView(body)) {
    return body.byteLength;
  }

  return null;
}

function requireValue<T>(
  value: T | null | undefined,
  fieldName: string,
): NonNullable<T> {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${fieldName} is required to persist this media asset.`);
  }

  return value;
}
