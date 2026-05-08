import type { SegmentStatus } from "./segment-status";

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
  id?: string;
  role: string;
  name: string;
  runwayUri?: string | null;
  mediaAssetId?: string | null;
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
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSeedanceSegmentInput {
  videoId: string;
  position: number;
  title: string;
  arc: string;
  logicalSceneIds: string[];
  description: string;
  prompt: string;
  promptInitial: string;
  references?: SegmentReference[];
  durationTarget: number;
  status?: SegmentStatus;
  createdBy?: string | null;
}
