import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import type { MediaStorageBucket } from "../media-asset.constants";

type StorageBucketApi = ReturnType<SupabaseDataClient["storage"]["from"]>;
export type StorageUploadBody = Parameters<StorageBucketApi["upload"]>[1];

export interface StoredStorageObject {
  bucket: MediaStorageBucket;
  path: string;
}

export async function uploadStorageObject(
  supabase: SupabaseDataClient,
  input: {
    bucket: MediaStorageBucket;
    path: string;
    body: StorageUploadBody;
    contentType?: string | null;
    upsert?: boolean;
  },
): Promise<StoredStorageObject> {
  const { error } = await supabase.storage
    .from(input.bucket)
    .upload(input.path, input.body, {
      contentType: input.contentType ?? "application/octet-stream",
      upsert: input.upsert ?? false,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  return {
    bucket: input.bucket,
    path: input.path,
  };
}

export async function downloadStorageObject(
  supabase: SupabaseDataClient,
  input: StoredStorageObject,
): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from(input.bucket)
    .download(input.path);

  if (error) {
    throw new Error(`Supabase Storage download failed: ${error.message}`);
  }

  return data;
}

export {
  createStorageSignedUrl,
  tryCreateStorageSignedUrl,
} from "./storage-signed-url";
