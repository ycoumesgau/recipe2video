import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecipeSourceMediaAssetInput } from "@/modules/media-assets/media-asset.types";
import type { VideoProject } from "@/modules/videos/video.types";

type VideoProjectRow = {
  id: string;
  title: string | null;
  slug: string | null;
  recipe_url: string | null;
  recipe_data: Record<string, unknown> | null;
  status: VideoProject["status"];
  selected_video_model: string | null;
  selected_image_model: string | null;
  selected_tts_model: string | null;
  selected_sfx_model: string | null;
  total_cost_credits: number | null;
  total_cost_openai: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export interface CreateDraftVideoRecordInput {
  id: string;
  title: string;
  slug: string;
  recipeUrl: string | null;
  recipeData: Record<string, unknown>;
  selectedVideoModel: string;
  selectedImageModel: string;
  selectedTtsModel: string;
  selectedSfxModel: string;
}

export async function createDraftVideoRecord(
  supabase: SupabaseClient,
  input: CreateDraftVideoRecordInput
) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("videos")
    .insert({
      id: input.id,
      title: input.title,
      slug: input.slug,
      recipe_url: input.recipeUrl,
      recipe_data: input.recipeData,
      status: "draft",
      selected_video_model: input.selectedVideoModel,
      selected_image_model: input.selectedImageModel,
      selected_tts_model: input.selectedTtsModel,
      selected_sfx_model: input.selectedSfxModel,
      total_cost_credits: 0,
      total_cost_openai: 0,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single<VideoProjectRow>();

  if (error) {
    throw new Error(`Unable to create draft video: ${error.message}`);
  }

  return mapVideoProjectRow(data);
}

export async function insertRecipeSourceMediaAssets(
  supabase: SupabaseClient,
  assets: RecipeSourceMediaAssetInput[]
) {
  if (assets.length === 0) {
    return;
  }

  const now = new Date().toISOString();

  const { error } = await supabase.from("media_assets").insert(
    assets.map((asset) => ({
      id: asset.id,
      video_id: asset.videoId,
      type: "recipe_source",
      provider: "supabase",
      storage_bucket: asset.storageBucket,
      storage_path: asset.storagePath,
      original_filename: asset.originalFilename,
      mime_type: asset.mimeType,
      file_size_bytes: asset.fileSizeBytes,
      status: "stored",
      metadata: {},
      created_at: now,
      updated_at: now,
    }))
  );

  if (error) {
    throw new Error(`Unable to save recipe source media: ${error.message}`);
  }
}

export async function getVideoProjectById(
  supabase: SupabaseClient,
  videoId: string
) {
  const { data, error } = await supabase
    .from("videos")
    .select()
    .eq("id", videoId)
    .single<VideoProjectRow>();

  if (error) {
    throw new Error(`Unable to load video project: ${error.message}`);
  }

  return mapVideoProjectRow(data);
}

export async function listRecentVideoProjects(
  supabase: SupabaseClient,
  limit = 6
) {
  const { data, error } = await supabase
    .from("videos")
    .select()
    .order("updated_at", { ascending: false })
    .limit(limit)
    .returns<VideoProjectRow[]>();

  if (error) {
    throw new Error(`Unable to load video projects: ${error.message}`);
  }

  return data.map(mapVideoProjectRow);
}

function mapVideoProjectRow(row: VideoProjectRow): VideoProject {
  return {
    id: row.id,
    title: row.title ?? "Untitled recipe video",
    slug: row.slug ?? row.id,
    recipeUrl: row.recipe_url,
    recipeData: row.recipe_data,
    status: row.status,
    selectedVideoModel: row.selected_video_model ?? "seedance2",
    selectedImageModel: row.selected_image_model ?? "gpt_image_2",
    selectedTtsModel: row.selected_tts_model ?? "eleven_multilingual_v2",
    selectedSfxModel: row.selected_sfx_model ?? "eleven_text_to_sound_v2",
    totalCostCredits: row.total_cost_credits ?? 0,
    totalCostOpenai: row.total_cost_openai ?? 0,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
