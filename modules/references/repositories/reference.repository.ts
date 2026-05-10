import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import type { ReferenceAsset } from "../reference.types";
import type { ReferenceStatus } from "../reference-status";

type ReferenceAssetRow =
  Database["public"]["Tables"]["reference_assets"]["Row"];

export interface CreateReferenceAssetInput {
  id?: string;
  videoId?: string | null;
  mediaAssetId?: string | null;
  type: string;
  canonicalName: string;
  source: string;
  runwayUri?: string | null;
  prompt?: string | null;
  status?: ReferenceStatus;
}

export async function listReferenceAssetsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<ReferenceAsset[]> {
  const { data, error } = await supabase
    .from("reference_assets")
    .select("*")
    .or(`video_id.is.null,video_id.eq.${videoId}`)
    .order("created_at", { ascending: true });

  throwIfSupabaseError(error, "listReferenceAssetsForVideo failed");
  return data.map(mapReferenceAsset);
}

export async function getReferenceAssetById(
  supabase: SupabaseDataClient,
  referenceId: string,
): Promise<ReferenceAsset | null> {
  const { data, error } = await supabase
    .from("reference_assets")
    .select("*")
    .eq("id", referenceId)
    .maybeSingle();

  throwIfSupabaseError(error, "getReferenceAssetById failed");
  return data ? mapReferenceAsset(data) : null;
}

export async function insertReferenceAsset(
  supabase: SupabaseDataClient,
  input: CreateReferenceAssetInput,
): Promise<ReferenceAsset> {
  const row = {
    ...(input.id ? { id: input.id } : {}),
    video_id: input.videoId ?? null,
    media_asset_id: input.mediaAssetId ?? null,
    type: input.type,
    canonical_name: input.canonicalName,
    source: input.source,
    runway_uri: input.runwayUri ?? null,
    prompt: input.prompt ?? null,
    status: input.status ?? "planned",
  };

  const { data, error } = await supabase
    .from("reference_assets")
    .insert(row)
    .select("*")
    .single();

  throwIfSupabaseError(error, "insertReferenceAsset failed");
  return mapReferenceAsset(data);
}

export async function replaceAgentReferenceAssetsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
  references: CreateReferenceAssetInput[],
): Promise<ReferenceAsset[]> {
  const { error: deleteError } = await supabase
    .from("reference_assets")
    .delete()
    .eq("video_id", videoId)
    .eq("source", "agent_reference_plan");

  throwIfSupabaseError(
    deleteError,
    "replaceAgentReferenceAssetsForVideo delete failed",
  );

  if (references.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("reference_assets")
    .insert(
      references.map((reference) => ({
        ...(reference.id ? { id: reference.id } : {}),
        video_id: videoId,
        media_asset_id: reference.mediaAssetId ?? null,
        type: reference.type,
        canonical_name: reference.canonicalName,
        source: "agent_reference_plan",
        runway_uri: reference.runwayUri ?? null,
        prompt: reference.prompt ?? null,
        status: reference.status ?? "planned",
      })),
    )
    .select("*")
    .order("created_at", { ascending: true });

  throwIfSupabaseError(
    error,
    "replaceAgentReferenceAssetsForVideo insert failed",
  );
  return data.map(mapReferenceAsset);
}

export async function updateReferenceAssetStatus(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    status: ReferenceStatus;
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({ status: input.status })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetStatus failed");
  return mapReferenceAsset(data);
}

export async function updateReferenceAssetMedia(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    mediaAssetId: string;
    status?: ReferenceStatus;
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({
      media_asset_id: input.mediaAssetId,
      status: input.status,
    })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetMedia failed");
  return mapReferenceAsset(data);
}

export async function updateReferenceAssetPrompt(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    prompt: string | null;
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({ prompt: input.prompt })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetPrompt failed");
  return mapReferenceAsset(data);
}

export async function updateReferenceAssetRunwayUri(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    runwayUri: string;
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({
      runway_uri: input.runwayUri,
      status: "uploaded_to_runway",
    })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetRunwayUri failed");
  return mapReferenceAsset(data);
}

export function mapReferenceAsset(row: ReferenceAssetRow): ReferenceAsset {
  return {
    id: row.id,
    videoId: row.video_id,
    mediaAssetId: row.media_asset_id,
    type: row.type,
    canonicalName: row.canonical_name,
    source: row.source,
    runwayUri: row.runway_uri,
    prompt: row.prompt,
    status: row.status as ReferenceStatus,
    createdAt: row.created_at,
  };
}
