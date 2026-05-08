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

export type SeedanceMode = "References";

export interface RunwaySafeScore {
  stillImageReadable: boolean;
  singleMainMotion: boolean;
  dominantSound: boolean;
  visuallyDesirable: boolean;
  textureContrast: boolean;
  notes: string[];
}

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
  textureCue?: string | null;
  sfxCue?: string | null;
  satisfactionBeat: boolean;
  runwaySafeScore: RunwaySafeScore;
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
  mode: SeedanceMode;
  logicalSceneIds: string[];
  description: string;
  prompt: string;
  promptInitial: string;
  references: SegmentReference[];
  beats: string[];
  timing: string[];
  continuity: string;
  risk: string;
  audioPrompt: string;
  negatives: string[];
  qaChecklist: SeedancePromptQa;
  durationTarget: number;
  status: SegmentStatus;
  selectedGenerationId?: string | null;
}

export interface SeedancePromptQa {
  referencesWithinLimit: boolean;
  globalKitchenReferencePresent: boolean;
  referenceRolesExplicit: boolean;
  promptWithinPracticalLimit: boolean;
  hardCutsSpecified: boolean;
  mandatoryTimingSpecified: boolean;
  noSpeechVoiceoverOrMusic: boolean;
  fragileFoodPhysicsHandled: boolean;
  nonStandardGeometryHandled: boolean;
  sourcePoliciesApplied: string[];
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
