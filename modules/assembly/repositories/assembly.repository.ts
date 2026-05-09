import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database, Json } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";

import type { Composition } from "../assembly.types";
import type { ExportStatus } from "../export-status";

type CompositionRow = Database["public"]["Tables"]["compositions"]["Row"];

export async function getLatestCompositionByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<Composition | null> {
  const { data, error } = await supabase
    .from("compositions")
    .select("*")
    .eq("video_id", videoId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwIfSupabaseError(error, "getLatestCompositionByVideoId failed");
  return data ? mapComposition(data) : null;
}

export async function linkCompositionAudio(
  supabase: SupabaseDataClient,
  input: {
    videoId: string;
    audioMediaAssetId: string;
    createdBy?: string | null;
  },
): Promise<Composition> {
  const existing = await getLatestCompositionByVideoId(supabase, input.videoId);

  if (existing) {
    const { data, error } = await supabase
      .from("compositions")
      .update({
        audio_media_asset_id: input.audioMediaAssetId,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    throwIfSupabaseError(error, "linkCompositionAudio update failed");
    return mapComposition(data);
  }

  const { data, error } = await supabase
    .from("compositions")
    .insert({
      video_id: input.videoId,
      audio_media_asset_id: input.audioMediaAssetId,
      segment_order: toJson([]),
      export_status: "pending",
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "linkCompositionAudio insert failed");
  return mapComposition(data);
}

export function mapComposition(row: CompositionRow): Composition {
  return {
    id: row.id,
    videoId: row.video_id,
    exportMediaAssetId: row.export_media_asset_id,
    segmentOrder: fromJson<Json>(row.segment_order) ?? [],
    audioMediaAssetId: row.audio_media_asset_id,
    audioSync: fromJson<Json>(row.audio_sync),
    remotionProps: fromJson<Json>(row.remotion_props),
    exportStatus: row.export_status as ExportStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
