import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";

import type {
  CountVideoProjectsOptions,
  CreateVideoProjectInput,
  ListVideoProjectsOptions,
  RecipeData,
  Storyboard,
  VideoProject,
} from "../video.types";
import type { VideoStatus } from "../video-status";
import type {
  RecipeAgentRuntime,
  RecipeAgentStatus,
} from "@/modules/recipe-agent/recipe-agent.types";

type VideoRow = Database["public"]["Tables"]["videos"]["Row"];

export async function createVideoProject(
  supabase: SupabaseDataClient,
  input: CreateVideoProjectInput,
): Promise<VideoProject> {
  const { data, error } = await supabase
    .from("videos")
    .insert({
      title: input.title,
      recipe_number: input.recipeNumber,
      slug: input.slug,
      recipe_url: input.recipeUrl ?? null,
      recipe_data: input.recipeData ? toJson(input.recipeData) : null,
      status: input.status ?? "draft",
      selected_video_model: input.selectedVideoModel ?? "seedance2",
      selected_image_model: input.selectedImageModel ?? "gpt_image_2",
      selected_tts_model: input.selectedTtsModel ?? "eleven_multilingual_v2",
      selected_sfx_model: input.selectedSfxModel ?? "eleven_text_to_sound_v2",
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "createVideoProject failed");
  return mapVideoProject(data);
}

export async function getVideoProjectById(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<VideoProject | null> {
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .maybeSingle();

  throwIfSupabaseError(error, "getVideoProjectById failed");
  return data ? mapVideoProject(data) : null;
}

export async function getVideoProjectBySlug(
  supabase: SupabaseDataClient,
  slug: string,
): Promise<VideoProject | null> {
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  throwIfSupabaseError(error, "getVideoProjectBySlug failed");
  return data ? mapVideoProject(data) : null;
}

export async function listVideoProjects(
  supabase: SupabaseDataClient,
  options: ListVideoProjectsOptions = {},
): Promise<VideoProject[]> {
  let query = supabase
    .from("videos")
    .select("*")
    .order("updated_at", { ascending: false });

  const archiveFilter = options.archiveFilter ?? "active";
  if (archiveFilter === "active") {
    query = query.is("archived_at", null);
  } else if (archiveFilter === "archived") {
    query = query.not("archived_at", "is", null);
  }
  // "all": intentionally no filter on archived_at

  query = applyVideoStatusFilter(query, options.status);

  if (options.limit != null && options.offset != null) {
    query = query.range(
      options.offset,
      options.offset + options.limit - 1,
    );
  } else if (options.limit != null) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error, "listVideoProjects failed");
  return data.map(mapVideoProject);
}

export async function countVideoProjects(
  supabase: SupabaseDataClient,
  options: CountVideoProjectsOptions = {},
): Promise<number> {
  let query = supabase.from("videos").select("*", { count: "exact", head: true });

  const archiveFilter = options.archiveFilter ?? "active";
  if (archiveFilter === "active") {
    query = query.is("archived_at", null);
  } else if (archiveFilter === "archived") {
    query = query.not("archived_at", "is", null);
  }

  query = applyVideoStatusFilter(query, options.status);

  if (options.excludeStatuses?.length) {
    for (const status of options.excludeStatuses) {
      query = query.neq("status", status);
    }
  }

  const { count, error } = await query;
  throwIfSupabaseError(error, "countVideoProjects failed");
  return count ?? 0;
}

function applyVideoStatusFilter<T extends { eq: (col: string, val: string) => T; in: (col: string, vals: string[]) => T }>(
  query: T,
  status: ListVideoProjectsOptions["status"] | undefined,
): T {
  if (!status) {
    return query;
  }

  if (Array.isArray(status)) {
    return status.length > 0 ? query.in("status", status) : query;
  }

  return query.eq("status", status);
}

export async function updateVideoProjectTitle(
  supabase: SupabaseDataClient,
  videoId: string,
  title: string,
): Promise<VideoProject> {
  const { data, error } = await supabase
    .from("videos")
    .update({ title })
    .eq("id", videoId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateVideoProjectTitle failed");
  return mapVideoProject(data);
}

export async function updateVideoProjectStatus(
  supabase: SupabaseDataClient,
  videoId: string,
  status: VideoStatus,
): Promise<VideoProject> {
  const { data, error } = await supabase
    .from("videos")
    .update({ status })
    .eq("id", videoId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateVideoProjectStatus failed");
  return mapVideoProject(data);
}

export async function archiveAllActiveVideoProjects(
  supabase: SupabaseDataClient,
): Promise<number> {
  const archivedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("videos")
    .update({ archived_at: archivedAt })
    .is("archived_at", null)
    .select("id");

  throwIfSupabaseError(error, "archiveAllActiveVideoProjects failed");
  return data?.length ?? 0;
}

export async function getNextRecipeNumber(
  supabase: SupabaseDataClient,
): Promise<number> {
  const { data, error } = await supabase
    .from("videos")
    .select("recipe_number")
    .is("archived_at", null)
    .order("recipe_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  throwIfSupabaseError(error, "getNextRecipeNumber failed");
  return (data?.recipe_number ?? 0) + 1;
}

export async function isRecipeNumberTaken(
  supabase: SupabaseDataClient,
  recipeNumber: number,
  excludeVideoId?: string,
): Promise<boolean> {
  let query = supabase
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("recipe_number", recipeNumber)
    .is("archived_at", null);

  if (excludeVideoId) {
    query = query.neq("id", excludeVideoId);
  }

  const { count, error } = await query;
  throwIfSupabaseError(error, "isRecipeNumberTaken failed");
  return (count ?? 0) > 0;
}

export async function updateVideoProjectRecipeNumber(
  supabase: SupabaseDataClient,
  videoId: string,
  recipeNumber: number,
): Promise<VideoProject> {
  const { data, error } = await supabase
    .from("videos")
    .update({ recipe_number: recipeNumber })
    .eq("id", videoId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateVideoProjectRecipeNumber failed");
  return mapVideoProject(data);
}

export async function setVideoProjectArchived(
  supabase: SupabaseDataClient,
  videoId: string,
  archived: boolean,
): Promise<VideoProject> {
  const patch: { archived_at: string | null; recipe_number?: number } = {
    archived_at: archived ? new Date().toISOString() : null,
  };

  if (!archived) {
    patch.recipe_number = await getNextRecipeNumber(supabase);
  }

  const { data, error } = await supabase
    .from("videos")
    .update(patch)
    .eq("id", videoId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "setVideoProjectArchived failed");
  return mapVideoProject(data);
}

/**
 * Merge the existing `videos.recipe_data` JSON with the freshly ingested
 * recipe payload. The wizard pre-populates `source` and `productionDefaults`
 * at draft time; the ingest workflow adds `normalized` (structured recipe),
 * `clarifyingQuestions`, and `ingestedAt`. We keep the previous keys so the
 * UI can still show the original source even after re-ingest.
 */
export async function mergeVideoProjectRecipeData(
  supabase: SupabaseDataClient,
  videoId: string,
  patch: Record<string, unknown>,
): Promise<VideoProject> {
  const existing = await getVideoProjectById(supabase, videoId);
  if (!existing) {
    throw new Error(`Video ${videoId} not found.`);
  }

  const merged = {
    ...(existing.recipeData ?? {}),
    ...patch,
  };

  const { data, error } = await supabase
    .from("videos")
    .update({ recipe_data: toJson(merged) })
    .eq("id", videoId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "mergeVideoProjectRecipeData failed");
  return mapVideoProject(data);
}

/**
 * Replace the `videos.storyboard` JSON column with a high-level summary of
 * the storyboard plan (logical scene count, segment count, source).
 * The actual `logical_scenes` and `segments` rows live in their own tables.
 */
export async function updateVideoProjectStoryboardSummary(
  supabase: SupabaseDataClient,
  videoId: string,
  summary: Record<string, unknown>,
): Promise<VideoProject> {
  const { data, error } = await supabase
    .from("videos")
    .update({ storyboard: toJson(summary) })
    .eq("id", videoId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateVideoProjectStoryboardSummary failed");
  return mapVideoProject(data);
}

export function mapVideoProject(row: VideoRow): VideoProject {
  return {
    id: row.id,
    title: row.title,
    recipeNumber: row.recipe_number,
    slug: row.slug,
    recipeUrl: row.recipe_url,
    recipeData: fromJson<RecipeData>(row.recipe_data),
    status: row.status as VideoStatus,
    storyboard: fromJson<Storyboard>(row.storyboard),
    seedanceSegments: row.seedance_segments,
    selectedVideoModel: row.selected_video_model,
    selectedImageModel: row.selected_image_model,
    selectedTtsModel: row.selected_tts_model,
    selectedSfxModel: row.selected_sfx_model,
    totalCostCredits: row.total_cost_credits,
    totalCostOpenai: row.total_cost_openai,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    cursorAgentId: row.cursor_agent_id,
    cursorAgentRuntime: row.cursor_agent_runtime as RecipeAgentRuntime | null,
    agentWorkspacePath: row.agent_workspace_path,
    lastAgentRunId: row.last_agent_run_id,
    lastAgentSyncAt: row.last_agent_sync_at,
    agentStatus: row.agent_status as RecipeAgentStatus,
    agentGitBranch: row.agent_git_branch,
    agentGitCommitSha: row.agent_git_commit_sha,
  };
}
