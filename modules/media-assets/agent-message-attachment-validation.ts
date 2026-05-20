import {
  AGENT_MESSAGE_ATTACHMENT_ACCEPT,
  MAX_AGENT_MESSAGE_ATTACHMENTS,
} from "@/modules/media-assets/media-asset.constants";
import { MAX_RECIPE_SOURCE_FILE_SIZE_BYTES } from "@/modules/videos/video.constants";

const ACCEPTED_MIME_TYPES = new Set(
  AGENT_MESSAGE_ATTACHMENT_ACCEPT.split(",").map((value) => value.trim()),
);

export function assertAgentMessageAttachmentFiles(files: File[]) {
  if (files.length > MAX_AGENT_MESSAGE_ATTACHMENTS) {
    throw new Error(
      `Attach at most ${MAX_AGENT_MESSAGE_ATTACHMENTS} images per message.`,
    );
  }

  for (const file of files) {
    if (file.size > MAX_RECIPE_SOURCE_FILE_SIZE_BYTES) {
      throw new Error(
        `${file.name} is too large. Keep agent attachments under 16 MB.`,
      );
    }

    const mime = file.type?.toLowerCase().trim();
    if (mime && !ACCEPTED_MIME_TYPES.has(mime)) {
      throw new Error(
        `${file.name} must be JPG, PNG, or WebP (Cursor SDK vision input).`,
      );
    }

    if (!mime && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      throw new Error(`${file.name} must be JPG, PNG, or WebP.`);
    }
  }
}
