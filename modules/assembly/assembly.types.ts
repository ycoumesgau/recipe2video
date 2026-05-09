import type { Json } from "@/shared/supabase/database.types";

import type { ExportStatus } from "./export-status";

export interface AssemblyAudioSync {
  offsetSeconds: number;
  cutFromSeconds: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export interface AssemblySegmentClip {
  segmentId: string;
  mediaAssetId: string;
  generationId?: string | null;
  title: string;
  position: number;
  durationSeconds: number;
  sourceUrl: string;
  storageBucket: string;
  storagePath: string;
}

export interface AssemblyAudioTrack {
  mediaAssetId: string;
  title: string;
  sourceUrl: string;
  durationSeconds?: number | null;
}

export interface AssemblyRemotionProps {
  fps: number;
  width: number;
  height: number;
  segments: AssemblySegmentClip[];
  audio?: AssemblyAudioTrack | null;
  audioSync: AssemblyAudioSync;
}

export interface Composition {
  id: string;
  videoId: string;
  exportMediaAssetId?: string | null;
  segmentOrder: Json;
  audioMediaAssetId?: string | null;
  audioSync?: Json | null;
  remotionProps?: Json | null;
  exportStatus: ExportStatus;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}
