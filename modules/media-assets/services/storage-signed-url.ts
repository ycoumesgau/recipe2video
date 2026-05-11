import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import type { MediaStorageBucket } from "../media-asset.constants";

export interface StoredStorageObjectForSigning {
  bucket: MediaStorageBucket;
  path: string;
}

/**
 * Creates a signed read URL. Lives outside `server-only` modules so workers/tests can import it.
 */
export async function createStorageSignedUrl(
  supabase: SupabaseDataClient,
  input: StoredStorageObjectForSigning & {
    expiresInSeconds?: number;
  },
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(input.bucket)
    .createSignedUrl(input.path, input.expiresInSeconds ?? 60 * 60);

  if (error) {
    throw new Error(`Supabase Storage signed URL failed: ${error.message}`);
  }

  return data.signedUrl;
}
