import type { Json } from "@/shared/supabase/database.types";
import type {
  RecipeAgentRuntime,
  RecipeAgentStatus,
} from "@/modules/recipe-agent/recipe-agent.types";
import type { VideoStatus } from "./video-status";

export type RecipeSourceType = "url" | "photos" | "text" | "demo";

export interface RecipeSourceSummary {
  type: RecipeSourceType;
  recipeUrl?: string | null;
  pastedTextPreview?: string | null;
  demoRecipeId?: string | null;
  uploadedFileNames?: string[];
}

export interface VideoProductionDefaults {
  targetDurationSeconds?: number;
  stylePreset: string;
  videoModel: string;
  imageModel: string;
  ttsModel: string;
  sfxModel: string;
  cursorAgentModel?: string;
  cursorAgentReasoning?: string;
  cursorAgentFast?: string;
}

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
  /** When set, the project is excluded from the default library list. */
  archivedAt?: string | null;
  cursorAgentId?: string | null;
  cursorAgentRuntime?: RecipeAgentRuntime | null;
  agentWorkspacePath?: string | null;
  lastAgentRunId?: string | null;
  lastAgentSyncAt?: string | null;
  agentStatus: RecipeAgentStatus;
  agentGitBranch?: string | null;
  agentGitCommitSha?: string | null;
}

/** `active`: non-archived only (default). `archived`: archived only. `all`: no archive filter. */
export type VideoProjectArchiveFilter = "active" | "archived" | "all";

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
  archiveFilter?: VideoProjectArchiveFilter;
}
