import type { Json } from "@/shared/supabase/database.types";

import type { VideoStatus } from "./video-status";

export type RecipeData = Record<string, unknown>;
export type Storyboard = Record<string, unknown>;

export interface VideoProject {
  id: string;
  title: string;
  slug: string;
  recipeUrl?: string | null;
  recipeData?: RecipeData | null;
  status: VideoStatus;
  storyboard?: Storyboard | null;
  seedanceSegments?: Json | null;
  selectedVideoModel: string;
  selectedImageModel: string;
  selectedTtsModel: string;
  selectedSfxModel: string;
  totalCostCredits: number;
  totalCostOpenai: number;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVideoProjectInput {
  title: string;
  slug: string;
  recipeUrl?: string | null;
  recipeData?: RecipeData | null;
  status?: VideoStatus;
  selectedVideoModel?: string;
  selectedImageModel?: string;
  selectedTtsModel?: string;
  selectedSfxModel?: string;
  createdBy?: string | null;
}

export interface ListVideoProjectsOptions {
  status?: VideoStatus;
  limit?: number;
}
