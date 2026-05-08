import "server-only";

import type { MuxAssetResult } from "../media-asset.types";

const MUX_VIDEO_API_BASE_URL = "https://api.mux.com/video/v1";

interface MuxCreateAssetResponse {
  data?: {
    id?: string;
    status?: string;
    playback_ids?: Array<{
      id?: string;
      policy?: string;
    }>;
  };
  error?: {
    type?: string;
    messages?: string[];
  };
}

export class MuxConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MuxConfigurationError";
  }
}

export class MuxApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MuxApiError";
  }
}

export async function createMuxAssetFromUrl(input: {
  mediaAssetId: string;
  sourceUrl: string;
}): Promise<MuxAssetResult> {
  const response = await fetch(`${MUX_VIDEO_API_BASE_URL}/assets`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getMuxBasicAuthToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [{ url: input.sourceUrl }],
      playback_policies: ["public"],
      passthrough: input.mediaAssetId,
      video_quality: "basic",
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | MuxCreateAssetResponse
    | null;

  if (!response.ok) {
    throw new MuxApiError(
      formatMuxError(payload) ?? "Mux asset creation failed.",
      response.status,
    );
  }

  const muxAssetId = payload?.data?.id;
  const muxPlaybackId = payload?.data?.playback_ids?.[0]?.id;

  if (!muxAssetId || !muxPlaybackId) {
    throw new MuxApiError("Mux response did not include playback metadata.");
  }

  return {
    mediaAssetId: input.mediaAssetId,
    muxAssetId,
    muxPlaybackId,
    muxStatus: payload?.data?.status ?? null,
  };
}

export function getMuxPlaybackUrl(playbackId: string) {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

export function getMuxThumbnailUrl(playbackId: string) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg`;
}

function getMuxBasicAuthToken() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    throw new MuxConfigurationError(
      "MUX_TOKEN_ID and MUX_TOKEN_SECRET are required for Mux uploads.",
    );
  }

  return Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64");
}

function formatMuxError(payload: MuxCreateAssetResponse | null) {
  const messages = payload?.error?.messages?.filter(Boolean);
  if (messages && messages.length > 0) {
    return messages.join(" ");
  }

  return payload?.error?.type;
}
