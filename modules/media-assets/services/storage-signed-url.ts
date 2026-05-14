import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import type { MediaStorageBucket } from "../media-asset.constants";

export interface StoredStorageObjectForSigning {
  bucket: MediaStorageBucket;
  path: string;
}

/**
 * Creates a signed read URL. Lives outside `server-only` modules so workers/tests can import it.
 *
 * Pass `download: true` (or `download: "name.mp4"`) to tell Supabase Storage
 * to serve the file with `Content-Disposition: attachment` so the browser
 * downloads it instead of trying to play it inline. Use the filename form
 * when you want a specific filename in the user's Downloads folder; passing
 * `true` falls back to the object's path basename.
 */
export async function createStorageSignedUrl(
  supabase: SupabaseDataClient,
  input: StoredStorageObjectForSigning & {
    expiresInSeconds?: number;
    download?: boolean | string;
  },
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(input.bucket)
    .createSignedUrl(input.path, input.expiresInSeconds ?? 60 * 60, {
      download: input.download,
    });

  if (error) {
    throw new Error(`Supabase Storage signed URL failed: ${error.message}`);
  }

  return data.signedUrl;
}
