import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import type {
  AssemblyPreset,
  AssemblyTimelineState,
  Composition,
  SegmentPlacement,
} from "../assembly.types";
import {
  insertPreset,
  updatePreset,
} from "../repositories/assembly-presets.repository";
import { upsertDraftCompositionForPreset } from "../repositories/assembly.repository";
import {
  buildClipsFromPlacements,
  projectLegacyAudioSync,
  resolveLinkedAudioMediaAssetId,
} from "../timeline-state";
import { buildRemotionProps } from "../build-remotion-props";
import type { AssemblyPageData } from "./get-assembly-data";

export interface SaveAssemblyPresetSettingsInput {
  supabase: SupabaseDataClient;
  videoId: string;
  presetId: string | null;
  presetName?: string;
  placements: SegmentPlacement[];
  timelineState: AssemblyTimelineState;
  audioMediaAssetId?: string | null;
  assemblyData: AssemblyPageData;
  createdBy: string;
}

export interface SaveAssemblyPresetSettingsResult {
  preset: AssemblyPreset;
  composition: Composition;
}

export async function saveAssemblyPresetSettings(
  input: SaveAssemblyPresetSettingsInput,
): Promise<SaveAssemblyPresetSettingsResult> {
  const orderedClips = buildClipsFromPlacements(
    input.placements,
    new Map(
      input.assemblyData.availableSegments.map((segment) => [
        segment.segmentId,
        {
          segmentId: segment.segmentId,
          mediaAssetId: segment.mediaAssetId,
          generationId: segment.generationId,
          title: segment.title,
          durationSeconds: segment.durationSeconds,
          sourceUrl: segment.sourceUrl,
          storageBucket: segment.storageBucket,
          storagePath: segment.storagePath,
        },
      ]),
    ),
  );

  if (orderedClips.length === 0) {
    throw new Error("No accepted Supabase-stored segment clips are available yet.");
  }

  const audioMediaAssetId = resolveLinkedAudioMediaAssetId(
    input.timelineState.audioClips,
    input.audioMediaAssetId,
  );

  const audioTrack =
    audioMediaAssetId &&
    input.assemblyData.audioTrack?.mediaAssetId === audioMediaAssetId
      ? input.assemblyData.audioTrack
      : null;

  const remotionProps = buildRemotionProps({
    segments: orderedClips,
    audioTrack,
    audioClips: input.timelineState.audioClips,
  });

  const savePayload = {
    placements: input.placements,
    audioMediaAssetId,
    audioSync: projectLegacyAudioSync(input.timelineState.audioClips),
    timelineState: input.timelineState,
    remotionProps,
  };

  let preset: AssemblyPreset;

  if (input.presetId) {
    const existing = input.assemblyData.presets.find(
      (candidate) => candidate.id === input.presetId,
    );
    if (!existing) {
      throw new Error("Assembly preset not found for this video.");
    }
    preset = await updatePreset(input.supabase, input.presetId, savePayload);
  } else {
    preset = await insertPreset(input.supabase, {
      videoId: input.videoId,
      name: input.presetName?.trim() || "Default",
      ...savePayload,
      createdBy: input.createdBy,
    });
  }

  const composition = await upsertDraftCompositionForPreset(input.supabase, {
    videoId: input.videoId,
    presetId: preset.id,
    ...savePayload,
    exportStatus: "pending",
    createdBy: input.createdBy,
  });

  return { preset, composition };
}
