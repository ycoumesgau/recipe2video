import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";

import type {
  CreateSeedanceSegmentInput,
  SeedanceSegment,
  SegmentReference,
} from "../storyboard.types";
import type { SegmentStatus } from "../segment-status";

type SegmentRow = Database["public"]["Tables"]["segments"]["Row"];

export async function createSeedanceSegment(
  supabase: SupabaseDataClient,
  input: CreateSeedanceSegmentInput,
): Promise<SeedanceSegment> {
  const { data, error } = await supabase
    .from("segments")
    .insert({
      video_id: input.videoId,
      position: input.position,
      title: input.title,
      arc: input.arc,
      logical_scene_ids: toJson(input.logicalSceneIds),
      description: input.description,
      prompt: input.prompt,
      prompt_initial: input.promptInitial,
      references: toJson(input.references ?? []),
      duration_target: input.durationTarget,
      status: input.status ?? "pending",
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "createSeedanceSegment failed");
  return mapSeedanceSegment(data);
}

/**
 * Replace every Seedance segment row for the given video with the supplied
 * batch. Used by the storyboard generation workflow when a fresh storyboard
 * has just been compressed by GPT-5.5; the previous draft is wiped to avoid
 * stale rows.
 */
export async function replaceSegmentsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
  segments: CreateSeedanceSegmentInput[],
): Promise<SeedanceSegment[]> {
  const { error: deleteError } = await supabase
    .from("segments")
    .delete()
    .eq("video_id", videoId);

  throwIfSupabaseError(deleteError, "replaceSegmentsForVideo delete failed");

  if (segments.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("segments")
    .insert(
      segments.map((segment) => ({
        video_id: segment.videoId,
        position: segment.position,
        title: segment.title,
        arc: segment.arc,
        logical_scene_ids: toJson(segment.logicalSceneIds),
        description: segment.description,
        prompt: segment.prompt,
        prompt_initial: segment.promptInitial,
        references: toJson(segment.references ?? []),
        duration_target: segment.durationTarget,
        status: segment.status ?? "pending",
        created_by: segment.createdBy ?? null,
      })),
    )
    .select("*")
    .order("position", { ascending: true });

  throwIfSupabaseError(error, "replaceSegmentsForVideo insert failed");
  return data.map(mapSeedanceSegment);
}

/**
 * Non-destructive sync keyed by `(video_id, position)`.
 *
 * Existing rows are updated in place and preserve `id`, `status`,
 * `selected_generation_id`, and audit timestamps. Missing positions are
 * inserted as new rows. Positions absent from the incoming batch are preserved
 * intentionally to keep historical generations/media links intact.
 */
export async function upsertSegmentsForVideoByPosition(
  supabase: SupabaseDataClient,
  videoId: string,
  segments: CreateSeedanceSegmentInput[],
): Promise<SeedanceSegment[]> {
  const existing = await listSegmentsByVideoId(supabase, videoId);
  const existingByPosition = new Map(
    existing.map((segment) => [segment.position, segment]),
  );
  const persisted: SeedanceSegment[] = [];

  for (const segment of segments) {
    const current = existingByPosition.get(segment.position);

    if (current) {
      const { data, error } = await supabase
        .from("segments")
        .update({
          title: segment.title,
          arc: segment.arc,
          logical_scene_ids: toJson(segment.logicalSceneIds),
          description: segment.description,
          prompt: segment.prompt,
          prompt_initial: segment.promptInitial,
          references: toJson(segment.references ?? []),
          duration_target: segment.durationTarget,
          created_by: segment.createdBy ?? current.createdBy ?? null,
        })
        .eq("id", current.id)
        .select("*")
        .single();

      throwIfSupabaseError(
        error,
        "upsertSegmentsForVideoByPosition update failed",
      );
      persisted.push(mapSeedanceSegment(data));
      continue;
    }

    const { data, error } = await supabase
      .from("segments")
      .insert({
        video_id: segment.videoId,
        position: segment.position,
        title: segment.title,
        arc: segment.arc,
        logical_scene_ids: toJson(segment.logicalSceneIds),
        description: segment.description,
        prompt: segment.prompt,
        prompt_initial: segment.promptInitial,
        references: toJson(segment.references ?? []),
        duration_target: segment.durationTarget,
        status: segment.status ?? "pending",
        created_by: segment.createdBy ?? null,
      })
      .select("*")
      .single();

    throwIfSupabaseError(
      error,
      "upsertSegmentsForVideoByPosition insert failed",
    );
    persisted.push(mapSeedanceSegment(data));
  }

  return persisted.sort((a, b) => a.position - b.position);
}

export async function listSegmentsByVideoId(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<SeedanceSegment[]> {
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .eq("video_id", videoId)
    .order("position", { ascending: true });

  throwIfSupabaseError(error, "listSegmentsByVideoId failed");
  return data.map(mapSeedanceSegment);
}

export type SegmentProgressRow = {
  id: string;
  videoId: string;
  status: SegmentStatus;
};

/**
 * Lightweight segment rows for dashboard cards (status counts per project).
 */
export async function listSegmentProgressByVideoIds(
  supabase: SupabaseDataClient,
  videoIds: string[],
): Promise<SegmentProgressRow[]> {
  if (videoIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("segments")
    .select("id, video_id, status")
    .in("video_id", videoIds);

  throwIfSupabaseError(error, "listSegmentProgressByVideoIds failed");

  return (data ?? []).map((row) => ({
    id: row.id,
    videoId: row.video_id,
    status: row.status as SegmentStatus,
  }));
}

export async function getSegmentById(
  supabase: SupabaseDataClient,
  segmentId: string,
): Promise<SeedanceSegment | null> {
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .eq("id", segmentId)
    .maybeSingle();

  throwIfSupabaseError(error, "getSegmentById failed");
  return data ? mapSeedanceSegment(data) : null;
}

export async function updateSegmentStatus(
  supabase: SupabaseDataClient,
  segmentId: string,
  status: SegmentStatus,
): Promise<SeedanceSegment> {
  const { data, error } = await supabase
    .from("segments")
    .update({ status })
    .eq("id", segmentId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateSegmentStatus failed");
  return mapSeedanceSegment(data);
}

export async function updateSegmentPrompt(
  supabase: SupabaseDataClient,
  segmentId: string,
  prompt: string,
): Promise<SeedanceSegment> {
  const { data, error } = await supabase
    .from("segments")
    .update({ prompt })
    .eq("id", segmentId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateSegmentPrompt failed");
  return mapSeedanceSegment(data);
}

/**
 * Rewrite the segment's prompt + reference list + arc + duration + status
 * in a single update. Used by the "Apply standard outro" backfill flow
 * to swap an agent-authored outro for the canonical template without
 * relying on a full storyboard re-sync.
 */
export async function rewriteSegmentForOutroOverride(
  supabase: SupabaseDataClient,
  segmentId: string,
  input: {
    prompt: string;
    promptInitial: string;
    references: SegmentReference[];
    durationTarget: number;
    arc: string;
    status: SegmentStatus;
  },
): Promise<SeedanceSegment> {
  const { data, error } = await supabase
    .from("segments")
    .update({
      prompt: input.prompt,
      prompt_initial: input.promptInitial,
      references: toJson(input.references),
      duration_target: input.durationTarget,
      arc: input.arc,
      status: input.status,
    })
    .eq("id", segmentId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "rewriteSegmentForOutroOverride failed");
  return mapSeedanceSegment(data);
}

export async function setSelectedGenerationForSegment(
  supabase: SupabaseDataClient,
  segmentId: string,
  generationId: string | null,
): Promise<SeedanceSegment> {
  const { data, error } = await supabase
    .from("segments")
    .update({ selected_generation_id: generationId })
    .eq("id", segmentId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "setSelectedGenerationForSegment failed");
  return mapSeedanceSegment(data);
}

export function mapSeedanceSegment(row: SegmentRow): SeedanceSegment {
  return {
    id: row.id,
    videoId: row.video_id,
    position: row.position,
    title: row.title,
    arc: row.arc,
    mode: "References",
    logicalSceneIds: fromJson<string[]>(row.logical_scene_ids) ?? [],
    description: row.description,
    prompt: row.prompt,
    promptInitial: row.prompt_initial,
    references: fromJson<SegmentReference[]>(row.references) ?? [],
    beats: [],
    timing: [],
    continuity: "",
    risk: "",
    audioPrompt: "",
    negatives: [],
    qaChecklist: {
      referencesWithinLimit: true,
      globalKitchenReferencePresent: false,
      referenceRolesExplicit: true,
      promptWithinPracticalLimit: true,
      hardCutsSpecified: row.prompt.includes("hard cuts"),
      mandatoryTimingSpecified: row.prompt.includes("Mandatory timing"),
      noSpeechVoiceoverOrMusic:
        row.prompt.includes("no speech") &&
        row.prompt.includes("no voiceover") &&
        row.prompt.includes("no music"),
      fragileFoodPhysicsHandled: false,
      nonStandardGeometryHandled: false,
      sourcePoliciesApplied: [],
    },
    durationTarget: row.duration_target,
    status: row.status as SegmentStatus,
    selectedGenerationId: row.selected_generation_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
