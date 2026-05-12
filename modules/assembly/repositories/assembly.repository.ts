import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database, Json } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";

import type {
  AssemblyAudioSync,
  AssemblyRemotionProps,
  AssemblyTimelineState,
  Composition,
  SegmentPlacement,
} from "../assembly.types";
import type { ExportStatus } from "../export-status";
import { serializePlacements } from "../timeline-state";

type CompositionRow = Database["public"]["Tables"]["compositions"]["Row"];

export interface SaveCompositionInput {
  id?: string;
  videoId: string;
  /**
   * Ordered list of placements on the video track. Persisted in
   * `compositions.segment_order` as `{ schema: 'placements_v1', ... }`.
   * The reader (`readPlacementsState`) still accepts the two legacy shapes
   * (`string[]` with optional `segmentTrims`) for backward compat.
   */
  placements: SegmentPlacement[];
  audioMediaAssetId?: string | null;
  /**
   * Legacy single-track audio sync. Kept for forward compatibility but the
   * new {@link timelineState} field is the source of truth and is what
   * actually gets persisted in `compositions.audio_sync`.
   */
  audioSync?: AssemblyAudioSync;
  /**
   * Audio side of the timeline state. Persisted in
   * `compositions.audio_sync` as `{ schema: 'timeline_v2', audioClips: [...] }`.
   * Per-segment trims are no longer carried here — they live inline on each
   * placement.
   */
  timelineState?: AssemblyTimelineState;
  remotionProps: AssemblyRemotionProps;
  exportStatus?: ExportStatus;
  exportMediaAssetId?: string | null;
  createdBy?: string | null;
}

function serializeSegmentOrderColumn(
  input: Pick<SaveCompositionInput, "placements">,
) {
  return toJson(serializePlacements(input.placements));
}

function serializeAudioSyncColumn(
  input: Pick<SaveCompositionInput, "timelineState" | "audioSync">,
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

export async function getCompositionById(
  supabase: SupabaseDataClient,
  compositionId: string,
): Promise<Composition | null> {
  const { data, error } = await supabase
    .from("compositions")
    .select("*")
    .eq("id", compositionId)
    .maybeSingle();

  throwIfSupabaseError(error, "getCompositionById failed");
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
      segment_order: serializeSegmentOrderColumn(input),
      audio_media_asset_id: input.audioMediaAssetId ?? null,
      audio_sync: serializeAudioSyncColumn(input),
      remotion_props: toJson(input.remotionProps),
      export_status: input.exportStatus ?? "pending",
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "createComposition failed");
  return mapComposition(data);
}

/**
 * Upsert the current draft composition for the given video. Used by
 * `saveAssemblySettingsAction` to avoid stacking a new row on every save.
 *
 * Strategy:
 *   - If a draft (export_status = 'pending') already exists for the video,
 *     update it in place and keep the original `id` and `created_at`.
 *   - Otherwise insert a new draft row.
 *
 * Final exports keep their own dedicated row created with `createComposition`
 * so the history of completed exports is preserved.
 */
export async function upsertDraftComposition(
  supabase: SupabaseDataClient,
  input: SaveCompositionInput,
): Promise<Composition> {
  const { data: existing, error: fetchError } = await supabase
    .from("compositions")
    .select("*")
    .eq("video_id", input.videoId)
    .eq("export_status", "pending")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwIfSupabaseError(fetchError, "upsertDraftComposition lookup failed");

  if (existing) {
    const { data, error } = await supabase
      .from("compositions")
      .update({
        segment_order: serializeSegmentOrderColumn(input),
        audio_media_asset_id: input.audioMediaAssetId ?? null,
        audio_sync: serializeAudioSyncColumn(input),
        remotion_props: toJson(input.remotionProps),
        export_status: input.exportStatus ?? "pending",
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    throwIfSupabaseError(error, "upsertDraftComposition update failed");
    return mapComposition(data);
  }

  return createComposition(supabase, input);
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
