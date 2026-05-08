import type { VideoStatus } from "@/modules/videos/video-status";

export type RecipeSourceType = "url" | "photos" | "text" | "demo";

export interface RecipeSourceSummary {
  type: RecipeSourceType;
  recipeUrl?: string | null;
  pastedTextPreview?: string | null;
  demoRecipeId?: string | null;
  uploadedFileNames?: string[];
}

export interface VideoProductionDefaults {
  targetDurationSeconds: number;
  stylePreset: string;
  videoModel: string;
  imageModel: string;
  ttsModel: string;
  sfxModel: string;
}

export interface VideoProject {
  id: string;
  title: string;
  slug: string;
  recipeUrl?: string | null;
  recipeData?: Record<string, unknown> | null;
  status: VideoStatus;
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
