import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import type { LogicalScene } from "../storyboard.types";

type LogicalSceneRow = Database["public"]["Tables"]["logical_scenes"]["Row"];

export type CreateLogicalSceneInput = Omit<
  LogicalScene,
  "id" | "videoId" | "segmentId"
> & {
  segmentId?: string | null;
};

export async function listLogicalScenesByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<LogicalScene[]> {
  const { data, error } = await supabase
    .from("logical_scenes")
    .select("*")
    .eq("video_id", videoId)
    .order("position", { ascending: true });

  throwIfSupabaseError(error, "listLogicalScenesByVideoId failed");
  return data.map(mapLogicalScene);
}

export async function replaceLogicalScenesForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
  scenes: CreateLogicalSceneInput[],
): Promise<LogicalScene[]> {
  const { error: deleteError } = await supabase
    .from("logical_scenes")
    .delete()
    .eq("video_id", videoId);

  throwIfSupabaseError(deleteError, "replaceLogicalScenesForVideo delete failed");

  const { data, error } = await supabase
    .from("logical_scenes")
    .insert(
      scenes.map((scene) => ({
        video_id: videoId,
        segment_id: scene.segmentId ?? null,
        position: scene.position,
        scene_type: scene.sceneType,
        arc: scene.arc,
        description: scene.description,
        bg: scene.bg ?? null,
        zoom: scene.zoom ?? null,
        duration_target: scene.durationTarget ?? null,
        note: scene.note ?? null,
      })),
    )
    .select("*")
    .order("position", { ascending: true });

  throwIfSupabaseError(error, "replaceLogicalScenesForVideo insert failed");
  return data.map(mapLogicalScene);
}

/**
 * Non-destructive sync keyed by `(video_id, position)`.
 *
 * Existing rows are updated in place (stable IDs); missing positions are inserted.
 * Rows absent from `scenes` are intentionally preserved so downstream entities that
 * still reference them (historical segment variants, review traces) are not broken.
 */
export async function upsertLogicalScenesForVideoByPosition(
  supabase: SupabaseDataClient,
  videoId: string,
  scenes: CreateLogicalSceneInput[],
): Promise<LogicalScene[]> {
  const existing = await listLogicalScenesByVideoId(supabase, videoId);
  const existingByPosition = new Map(
    existing.map((scene) => [scene.position, scene]),
  );

  const persisted: LogicalScene[] = [];

  for (const scene of scenes) {
    const current = existingByPosition.get(scene.position);

    if (current) {
      const { data, error } = await supabase
        .from("logical_scenes")
        .update({
          segment_id: scene.segmentId ?? null,
          scene_type: scene.sceneType,
          arc: scene.arc,
          description: scene.description,
          bg: scene.bg ?? null,
          zoom: scene.zoom ?? null,
          duration_target: scene.durationTarget ?? null,
          note: scene.note ?? null,
        })
        .eq("id", current.id)
        .select("*")
        .single();

      throwIfSupabaseError(
        error,
        "upsertLogicalScenesForVideoByPosition update failed",
      );
      persisted.push(mapLogicalScene(data));
      continue;
    }

    const { data, error } = await supabase
      .from("logical_scenes")
      .insert({
        video_id: videoId,
        segment_id: scene.segmentId ?? null,
        position: scene.position,
        scene_type: scene.sceneType,
        arc: scene.arc,
        description: scene.description,
        bg: scene.bg ?? null,
        zoom: scene.zoom ?? null,
        duration_target: scene.durationTarget ?? null,
        note: scene.note ?? null,
      })
      .select("*")
      .single();

    throwIfSupabaseError(
      error,
      "upsertLogicalScenesForVideoByPosition insert failed",
    );
    persisted.push(mapLogicalScene(data));
  }

  return persisted.sort((a, b) => a.position - b.position);
}

export async function updateLogicalSceneSegmentLinks(
  supabase: SupabaseDataClient,
  links: { sceneId: string; segmentId: string }[],
): Promise<void> {
  for (const link of links) {
    const { error } = await supabase
      .from("logical_scenes")
      .update({ segment_id: link.segmentId })
      .eq("id", link.sceneId);

    throwIfSupabaseError(error, "updateLogicalSceneSegmentLinks failed");
  }
}

export function mapLogicalScene(row: LogicalSceneRow): LogicalScene {
  return {
    id: row.id,
    videoId: row.video_id,
    segmentId: row.segment_id,
    position: row.position,
    sceneType: row.scene_type as LogicalScene["sceneType"],
    arc: row.arc,
    description: row.description,
    bg: row.bg,
    zoom: row.zoom,
    durationTarget: row.duration_target,
    note: row.note,
  };
}
