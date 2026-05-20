import type { MediaAsset } from "./media-asset.types";

/** Row persisted as an agent message vision attachment (Cursor SDK `images`). */
export function isAgentMessageAttachmentImage(asset: MediaAsset): boolean {
  if (asset.type !== "agent_message_attachment") {
    return false;
  }

  const mime = asset.mimeType?.toLowerCase().trim();
  if (mime && mime.startsWith("image/")) {
    return true;
  }

  const name = asset.originalFilename ?? "";
  return /\.(jpe?g|png|webp)$/i.test(name);
}
