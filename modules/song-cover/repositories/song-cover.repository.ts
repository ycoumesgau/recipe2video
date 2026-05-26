import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import type { RunwayTaskStatusValue } from "@/modules/generation/runway.types";
import type { ReferenceStatus } from "@/modules/references/reference-status";

import type {
  CreateSongCoverArtifactInput,
  SongCoverArtifact,
  SongCoverArtifactKind,
  UpdateSongCoverArtifactInput,
} from "../song-cover.types";

type SongCoverArtifactRow =
  Database["public"]["Tables"]["song_cover_artifacts"]["Row"];

export async function listSongCoverArtifactsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<SongCoverArtifact[]> {
  const { data, error } = await supabase
    .from("song_cover_artifacts")
    .select("*")
    .eq("video_id", videoId)
    .order("kind", { ascending: true });

  throwIfSupabaseError(error, "listSongCoverArtifactsForVideo failed");
  return (data ?? []).map(mapSongCoverArtifact);
}

export async function getSongCoverArtifactById(
  supabase: SupabaseDataClient,
  artifactId: string,
): Promise<SongCoverArtifact | null> {
  const { data, error } = await supabase
    .from("song_cover_artifacts")
    .select("*")
    .eq("id", artifactId)
    .maybeSingle();

  throwIfSupabaseError(error, "getSongCoverArtifactById failed");
  return data ? mapSongCoverArtifact(data) : null;
}

export async function getSongCoverArtifactForVideoByKind(
  supabase: SupabaseDataClient,
  videoId: string,
  kind: SongCoverArtifactKind,
): Promise<SongCoverArtifact | null> {
  const { data, error } = await supabase
    .from("song_cover_artifacts")
    .select("*")
    .eq("video_id", videoId)
    .eq("kind", kind)
    .maybeSingle();

  throwIfSupabaseError(error, "getSongCoverArtifactForVideoByKind failed");
  return data ? mapSongCoverArtifact(data) : null;
}

/**
 * Upsert by (video_id, kind). Preserves the existing `active_media_asset_id`,
 * `status`, and any runway task fields on update — only the plan fields
 * (prompt + refs + loop anchor + duration + notes) are overwritten. This
 * makes the sync from the agent idempotent and non-destructive of the
 * operator's active variant.
 */
export async function upsertSongCoverArtifact(
  supabase: SupabaseDataClient,
  input: CreateSongCoverArtifactInput,
): Promise<SongCoverArtifact> {
  const existing = await getSongCoverArtifactForVideoByKind(
    supabase,
    input.videoId,
    input.kind,
  );

  if (existing) {
    const { data, error } = await supabase
      .from("song_cover_artifacts")
      .update({
        prompt: input.prompt,
        image_reference_canonical_names: input.imageReferenceCanonicalNames,
        video_reference_canonical_names:
          input.videoReferenceCanonicalNames ?? [],
        loop_anchor_reference_name: input.loopAnchorReferenceName ?? null,
        duration_seconds: input.durationSeconds ?? null,
        notes: input.notes ?? null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    throwIfSupabaseError(error, "upsertSongCoverArtifact update failed");
    return mapSongCoverArtifact(data);
  }

  const { data, error } = await supabase
    .from("song_cover_artifacts")
    .insert({
      video_id: input.videoId,
      kind: input.kind,
      prompt: input.prompt,
      image_reference_canonical_names: input.imageReferenceCanonicalNames,
      video_reference_canonical_names:
        input.videoReferenceCanonicalNames ?? [],
      loop_anchor_reference_name: input.loopAnchorReferenceName ?? null,
      duration_seconds: input.durationSeconds ?? null,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "upsertSongCoverArtifact insert failed");
  return mapSongCoverArtifact(data);
}

export async function updateSongCoverArtifact(
  supabase: SupabaseDataClient,
  artifactId: string,
  patch: UpdateSongCoverArtifactInput,
): Promise<SongCoverArtifact> {
  const row: Database["public"]["Tables"]["song_cover_artifacts"]["Update"] = {};
  if (patch.prompt !== undefined) row.prompt = patch.prompt;
  if (patch.imageReferenceCanonicalNames !== undefined)
    row.image_reference_canonical_names = patch.imageReferenceCanonicalNames;
  if (patch.videoReferenceCanonicalNames !== undefined)
    row.video_reference_canonical_names = patch.videoReferenceCanonicalNames;
  if (patch.loopAnchorReferenceName !== undefined)
    row.loop_anchor_reference_name = patch.loopAnchorReferenceName;
  if (patch.durationSeconds !== undefined)
    row.duration_seconds = patch.durationSeconds;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.activeMediaAssetId !== undefined)
    row.active_media_asset_id = patch.activeMediaAssetId;
  if (patch.runwayTaskId !== undefined) row.runway_task_id = patch.runwayTaskId;
  if (patch.runwayTaskStatus !== undefined)
    row.runway_task_status = patch.runwayTaskStatus;
  if (patch.runwayProgress !== undefined)
    row.runway_progress = patch.runwayProgress;
  if (patch.notes !== undefined) row.notes = patch.notes;

  const { data, error } = await supabase
    .from("song_cover_artifacts")
    .update(row)
    .eq("id", artifactId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateSongCoverArtifact failed");
  return mapSongCoverArtifact(data);
}

export async function listGeneratingSongCoverArtifacts(
  supabase: SupabaseDataClient,
  options: { limit?: number } = {},
): Promise<SongCoverArtifact[]> {
  let query = supabase
    .from("song_cover_artifacts")
    .select("*")
    .eq("status", "generating")
    .order("updated_at", { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error, "listGeneratingSongCoverArtifacts failed");
  return (data ?? []).map(mapSongCoverArtifact);
}

export async function countGeneratingSongCoverArtifactsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("song_cover_artifacts")
    .select("id", { count: "exact", head: true })
    .eq("video_id", videoId)
    .eq("status", "generating");

  throwIfSupabaseError(error, "countGeneratingSongCoverArtifactsForVideo failed");
  return count ?? 0;
}

export async function countGeneratingSongCoverArtifacts(
  supabase: SupabaseDataClient,
): Promise<number> {
  const { count, error } = await supabase
    .from("song_cover_artifacts")
    .select("id", { count: "exact", head: true })
    .eq("status", "generating");

  throwIfSupabaseError(error, "countGeneratingSongCoverArtifacts failed");
  return count ?? 0;
}

function mapSongCoverArtifact(row: SongCoverArtifactRow): SongCoverArtifact {
  return {
    id: row.id,
    videoId: row.video_id,
    kind: row.kind as SongCoverArtifactKind,
    prompt: row.prompt,
    imageReferenceCanonicalNames: row.image_reference_canonical_names ?? [],
    videoReferenceCanonicalNames: row.video_reference_canonical_names ?? [],
    loopAnchorReferenceName: row.loop_anchor_reference_name ?? null,
    durationSeconds: row.duration_seconds ?? null,
    status: row.status as ReferenceStatus,
    activeMediaAssetId: row.active_media_asset_id ?? null,
    runwayTaskId: row.runway_task_id ?? null,
    runwayTaskStatus: (row.runway_task_status as RunwayTaskStatusValue | null) ?? null,
    runwayProgress: row.runway_progress ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
