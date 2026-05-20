import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import { assertAgentMessageAttachmentFiles } from "@/modules/media-assets/agent-message-attachment-validation";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";

export { assertAgentMessageAttachmentFiles } from "@/modules/media-assets/agent-message-attachment-validation";

export async function persistAgentMessageAttachments(input: {
  supabase: SupabaseDataClient;
  videoId: string;
  files: File[];
  createdBy?: string | null;
}): Promise<MediaAsset[]> {
  const files = input.files.filter(
    (file) => file.size > 0 && file.name.length > 0,
  );

  if (files.length === 0) {
    return [];
  }

  assertAgentMessageAttachmentFiles(files);

  const results: MediaAsset[] = [];

  for (const [index, file] of files.entries()) {
    const asset = await persistMediaAssetFile({
      supabase: input.supabase,
      type: "agent_message_attachment",
      body: file,
      videoId: input.videoId,
      storageFilename: `${Date.now()}-${index}-${sanitizeFileName(file.name)}`,
      originalFilename: file.name,
      mimeType: file.type || null,
      fileSizeBytes: file.size,
      createdBy: input.createdBy ?? null,
      metadata: { purpose: "cursor_agent_vision" },
    });
    results.push(asset);
  }

  return results;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
