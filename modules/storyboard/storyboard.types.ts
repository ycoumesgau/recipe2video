export type SegmentStatus =
  | "pending"
  | "ready"
  | "queued"
  | "generating"
  | "review"
  | "accepted"
  | "rejected"
  | "failed"
  | "blocked";

export interface LogicalScene {
  id: string;
  videoId: string;
  segmentId?: string | null;
  position: number;
  sceneType: "detail" | "context";
  arc: string;
  description: string;
  bg?: string | null;
  zoom?: string | null;
  durationTarget?: number | null;
  note?: string | null;
}

export interface SegmentReference {
  id: string;
  role: string;
  label: string;
  runwayUri?: string | null;
  required: boolean;
}

export interface SeedanceSegment {
  id: string;
  videoId: string;
  position: number;
  title: string;
  arc: string;
  logicalSceneIds: string[];
  description: string;
  prompt: string;
  promptInitial: string;
  references: SegmentReference[];
  durationTarget: number;
  status: SegmentStatus;
  selectedGenerationId?: string | null;
}

export interface StoryboardPlan {
  logicalScenes: LogicalScene[];
  seedanceSegments: SeedanceSegment[];
}

export interface StoryboardGenerationInput {
  videoId: string;
  recipeTitle: string;
  recipeSteps: string[];
  targetDurationSeconds?: number;
  requestedByUserId: string;
  isAllowlisted: boolean;
}

export interface SeedanceSegmentationInput {
  videoId: string;
  logicalScenes: LogicalScene[];
  requestedByUserId: string;
  isAllowlisted: boolean;
}
