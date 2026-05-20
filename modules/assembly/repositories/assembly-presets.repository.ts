import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database, Json } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";

import type {
  AssemblyAudioSync,
  AssemblyRemotionProps,
  AssemblyTimelineState,
  AssemblyPreset,
  SegmentPlacement,
} from "../assembly.types";
import { serializePlacements } from "../timeline-state";

type AssemblyPresetRow = Database["public"]["Tables"]["assembly_presets"]["Row"];

export interface SaveAssemblyPresetInput {
  videoId: string;
  name: string;
  placements: SegmentPlacement[];
  audioMediaAssetId?: string | null;
  audioSync?: AssemblyAudioSync;
  timelineState?: AssemblyTimelineState;
  remotionProps: AssemblyRemotionProps;
  createdBy?: string | null;
}

function serializeSegmentOrderColumn(
  input: Pick<SaveAssemblyPresetInput, "placements">,
) {
  return toJson(serializePlacements(input.placements));
}

function serializeAudioSyncColumn(
  input: Pick<SaveAssemblyPresetInput, "timelineState" | "audioSync">,
) {
  if (input.timelineState) {
    return toJson({
      schema: "timeline_v2",
      audioClips: input.timelineState.audioClips,
    });
  }
  if (input.audioSync) {
    return toJson(input.audioSync);
  }
  return toJson({
    schema: "timeline_v2",
    audioClips: [],
  });
}

export function mapAssemblyPreset(row: AssemblyPresetRow): AssemblyPreset {
  return {
    id: row.id,
    videoId: row.video_id,
    name: row.name,
    segmentOrder: fromJson<Json>(row.segment_order) ?? [],
    audioMediaAssetId: row.audio_media_asset_id,
    audioSync: fromJson<Json>(row.audio_sync),
    remotionProps: fromJson<Json>(row.remotion_props),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPresetsByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<AssemblyPreset[]> {
  const { data, error } = await supabase
    .from("assembly_presets")
    .select("*")
    .eq("video_id", videoId)
    .order("created_at", { ascending: true });

  throwIfSupabaseError(error, "listPresetsByVideoId failed");
  return (data ?? []).map(mapAssemblyPreset);
}

export async function getPresetById(
  supabase: SupabaseDataClient,
  presetId: string,
): Promise<AssemblyPreset | null> {
  const { data, error } = await supabase
    .from("assembly_presets")
    .select("*")
    .eq("id", presetId)
    .maybeSingle();

  throwIfSupabaseError(error, "getPresetById failed");
  return data ? mapAssemblyPreset(data) : null;
}

export async function countPresetsByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("assembly_presets")
    .select("id", { count: "exact", head: true })
    .eq("video_id", videoId);

  throwIfSupabaseError(error, "countPresetsByVideoId failed");
  return count ?? 0;
}

export async function insertPreset(
  supabase: SupabaseDataClient,
  input: SaveAssemblyPresetInput,
): Promise<AssemblyPreset> {
  const { data, error } = await supabase
    .from("assembly_presets")
    .insert({
      video_id: input.videoId,
      name: input.name.trim(),
      segment_order: serializeSegmentOrderColumn(input),
      audio_media_asset_id: input.audioMediaAssetId ?? null,
      audio_sync: serializeAudioSyncColumn(input),
      remotion_props: toJson(input.remotionProps),
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "insertPreset failed");
  return mapAssemblyPreset(data);
}

export async function updatePreset(
  supabase: SupabaseDataClient,
  presetId: string,
  input: Omit<SaveAssemblyPresetInput, "videoId" | "name"> & {
    name?: string;
  },
): Promise<AssemblyPreset> {
  const { data, error } = await supabase
    .from("assembly_presets")
    .update({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      segment_order: serializeSegmentOrderColumn(input),
      audio_media_asset_id: input.audioMediaAssetId ?? null,
      audio_sync: serializeAudioSyncColumn(input),
      remotion_props: toJson(input.remotionProps),
    })
    .eq("id", presetId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updatePreset failed");
  return mapAssemblyPreset(data);
}

export async function renamePreset(
  supabase: SupabaseDataClient,
  presetId: string,
  name: string,
): Promise<AssemblyPreset> {
  const { data, error } = await supabase
    .from("assembly_presets")
    .update({ name: name.trim() })
    .eq("id", presetId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "renamePreset failed");
  return mapAssemblyPreset(data);
}

export async function deletePreset(
  supabase: SupabaseDataClient,
  presetId: string,
): Promise<void> {
  const { error } = await supabase
    .from("assembly_presets")
    .delete()
    .eq("id", presetId);

  throwIfSupabaseError(error, "deletePreset failed");
}

export async function updatePresetAudioMediaAsset(
  supabase: SupabaseDataClient,
  presetId: string,
  audioMediaAssetId: string,
): Promise<AssemblyPreset> {
  const { data, error } = await supabase
    .from("assembly_presets")
    .update({ audio_media_asset_id: audioMediaAssetId })
    .eq("id", presetId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updatePresetAudioMediaAsset failed");
  return mapAssemblyPreset(data);
}
