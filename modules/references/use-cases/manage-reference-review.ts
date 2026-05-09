import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";
import { downloadStorageObject } from "@/modules/media-assets/services/storage.service";
import { getMediaAssetById } from "@/modules/media-assets/repositories/media-asset.repository";
import { createRunwayUpload } from "@/modules/generation/services/runway.service";

import type { ReferenceAsset } from "../reference.types";
import type { ReferenceStatus } from "../reference-status";
import {
  getReferenceAssetById,
  insertReferenceAsset,
  updateReferenceAssetMedia,
  updateReferenceAssetRunwayUri,
  updateReferenceAssetStatus,
} from "../repositories/reference.repository";

export async function createManualReferenceUpload(
  supabase: SupabaseDataClient,
  input: {
    videoId: string;
    file: File;
    canonicalName: string;
    role: string;
    prompt?: string | null;
    createdBy?: string | null;
  },
): Promise<ReferenceAsset> {
  assertReferenceImageFile(input.file);

  const referenceId = crypto.randomUUID();
  await insertReferenceAsset(supabase, {
    id: referenceId,
    videoId: input.videoId,
    type: input.role,
    canonicalName: input.canonicalName,
    source: "uploaded_file",
    prompt: input.prompt ?? null,
    status: "planned",
  });

  const mediaAsset = await persistMediaAssetFile({
    supabase,
    type: "reference_image",
    provider: "manual",
    body: input.file,
    videoId: input.videoId,
    referenceId,
    originalFilename: input.file.name,
    mimeType: input.file.type,
    fileSizeBytes: input.file.size,
    metadata: {
      source: "manual_upload",
      referenceId,
      referenceRole: input.role,
    },
    createdBy: input.createdBy ?? null,
  });

  return updateReferenceAssetMedia(supabase, {
    referenceId,
    mediaAssetId: mediaAsset.id,
    status: "generated",
  });
}

export async function approveReferenceAsset(
  supabase: SupabaseDataClient,
  referenceId: string,
): Promise<ReferenceAsset> {
  const reference = await requireReferenceAsset(supabase, referenceId);

  if (!reference.mediaAssetId) {
    throw new Error(
      "Reference approval requires a Supabase Storage media asset first.",
    );
  }

  const mediaAsset = await getMediaAssetById(supabase, reference.mediaAssetId);

  if (!mediaAsset?.storageBucket || !mediaAsset.storagePath) {
    throw new Error(
      "Reference approval requires a stored Supabase Storage object.",
    );
  }

  return updateReferenceAssetStatus(supabase, {
    referenceId,
    status: "approved",
  });
}

export async function updateReferenceReviewStatus(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    status: Extract<ReferenceStatus, "planned" | "rejected">;
  },
): Promise<ReferenceAsset> {
  await requireReferenceAsset(supabase, input.referenceId);

  return updateReferenceAssetStatus(supabase, {
    referenceId: input.referenceId,
    status: input.status,
  });
}

export async function uploadReferenceAssetToRunway(
  supabase: SupabaseDataClient,
  referenceId: string,
): Promise<ReferenceAsset> {
  const reference = await requireReferenceAsset(supabase, referenceId);

  if (!reference.mediaAssetId) {
    throw new Error("Upload a reference image before sending it to Runway.");
  }

  const mediaAsset = await getMediaAssetById(supabase, reference.mediaAssetId);

  if (!mediaAsset?.storageBucket || !mediaAsset.storagePath) {
    throw new Error(
      "Runway upload requires the reference image in Supabase Storage.",
    );
  }

  const blob = await downloadStorageObject(supabase, {
    bucket: mediaAsset.storageBucket as MediaStorageBucket,
    path: mediaAsset.storagePath,
  });
  const runwayUri = await createRunwayUpload(blob, {
    fileName: mediaAsset.originalFilename ?? `${reference.id}.png`,
    fileMetadata: {
      referenceId: reference.id,
      videoId: reference.videoId,
      source: "recipe2video_reference_asset",
    },
  });

  // Audit-only cost row. createEphemeral uploads do not consume credits today,
  // but we keep a trace per Runway operation per the cost logging contract.
  if (reference.videoId) {
    await logCost(supabase, {
      videoId: reference.videoId,
      segmentId: null,
      provider: "runway",
      model: "uploads.create_ephemeral",
      operation: "reference_uploaded_to_runway",
      creditsUsed: 0,
      metadata: {
        referenceId: reference.id,
        runwayUri,
        mediaAssetId: mediaAsset.id,
      },
      createdBy: mediaAsset.createdBy,
    });
  }

  return updateReferenceAssetRunwayUri(supabase, {
    referenceId,
    runwayUri,
  });
}

async function requireReferenceAsset(
  supabase: SupabaseDataClient,
  referenceId: string,
) {
  const reference = await getReferenceAssetById(supabase, referenceId);

  if (!reference) {
    throw new Error("Reference asset not found.");
  }

  return reference;
}

function assertReferenceImageFile(file: File) {
  if (!file || file.size === 0) {
    throw new Error("Choose an image file before uploading a reference.");
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Reference uploads must be JPG, PNG, or WebP images.");
  }
}
