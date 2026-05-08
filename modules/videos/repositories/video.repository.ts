import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { fromJson, toJson } from "@/shared/supabase/json";

import type {
  CreateVideoProjectInput,
  ListVideoProjectsOptions,
  RecipeData,
  Storyboard,
  VideoProject,
} from "../video.types";
import type { VideoStatus } from "../video-status";

type VideoRow = Database["public"]["Tables"]["videos"]["Row"];

export async function createVideoProject(
  supabase: SupabaseDataClient,
  input: CreateVideoProjectInput,
): Promise<VideoProject> {
  const { data, error } = await supabase
    .from("videos")
    .insert({
      title: input.title,
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

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error, "listVideoProjects failed");
  return data.map(mapVideoProject);
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

export function mapVideoProject(row: VideoRow): VideoProject {
  return {
    id: row.id,
    title: row.title,
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
  };
}
