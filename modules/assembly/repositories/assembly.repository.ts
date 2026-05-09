import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";

import type {
  AssemblyAudioSync,
  AssemblyRemotionProps,
  Composition,
} from "../assembly.types";
import type { ExportStatus } from "../export-status";

type CompositionRow = Database["public"]["Tables"]["compositions"]["Row"];

export interface SaveCompositionInput {
  id?: string;
  videoId: string;
  segmentOrder: string[];
  audioMediaAssetId?: string | null;
  audioSync: AssemblyAudioSync;
  remotionProps: AssemblyRemotionProps;
  exportStatus?: ExportStatus;
  exportMediaAssetId?: string | null;
  createdBy?: string | null;
}

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

export async function createComposition(
  supabase: SupabaseDataClient,
  input: SaveCompositionInput,
): Promise<Composition> {
  const { data, error } = await supabase
    .from("compositions")
    .insert({
      id: input.id,
      video_id: input.videoId,
      export_media_asset_id: input.exportMediaAssetId ?? null,
      segment_order: toJson(input.segmentOrder),
      audio_media_asset_id: input.audioMediaAssetId ?? null,
      audio_sync: toJson(input.audioSync),
      remotion_props: toJson(input.remotionProps),
      export_status: input.exportStatus ?? "pending",
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "createComposition failed");
  return mapComposition(data);
}

export async function updateCompositionExport(
  supabase: SupabaseDataClient,
  input: {
    compositionId: string;
    exportMediaAssetId?: string | null;
    exportStatus: ExportStatus;
    remotionProps?: AssemblyRemotionProps;
  },
): Promise<Composition> {
  const { data, error } = await supabase
    .from("compositions")
    .update({
      export_media_asset_id: input.exportMediaAssetId,
      export_status: input.exportStatus,
      remotion_props: input.remotionProps
        ? toJson(input.remotionProps)
        : undefined,
    })
    .eq("id", input.compositionId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateCompositionExport failed");
  return mapComposition(data);
}

export function mapComposition(row: CompositionRow): Composition {
  return {
    id: row.id,
    videoId: row.video_id,
    exportMediaAssetId: row.export_media_asset_id,
    segmentOrder: fromJson(row.segment_order) ?? [],
    audioMediaAssetId: row.audio_media_asset_id,
    audioSync: fromJson(row.audio_sync),
    remotionProps: fromJson(row.remotion_props),
    exportStatus: row.export_status as ExportStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
