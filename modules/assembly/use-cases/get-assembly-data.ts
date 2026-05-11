import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import { listMediaAssetsByVideoId } from "@/modules/media-assets/repositories/media-asset.repository";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage.service";
import { listSegmentsByVideoId } from "@/modules/storyboard/repositories/segment.repository";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

import type {
  AssemblyAudioClip,
  AssemblyAudioSync,
  AssemblyAudioTrack,
  AssemblyRemotionProps,
  AssemblySegmentClip,
  AssemblyTimelineState,
  Composition,
  SegmentPlacement,
} from "../assembly.types";
import { getLatestCompositionByVideoId } from "../repositories/assembly.repository";
import {
  buildClipsFromPlacements,
  createDefaultAudioClip,
  defaultPlacementsForSegments,
  getDefaultAudioSync,
  projectLegacyAudioSync,
  readPlacementsState,
  readTimelineState,
} from "../timeline-state";

export { getDefaultAudioSync, getEmptyTimelineState } from "../timeline-state";

const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 1280;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Lookup table the editor uses on the available-segments side. The fields
 * mirror {@link AssemblySegmentClip} minus the per-placement fields, so we
 * can hydrate any number of placements from a single segment entry.
 */
type SegmentCatalogueEntry = Omit<
  AssemblySegmentClip,
  "placementId" | "position" | "inSeconds" | "outSeconds"
>;

export interface AssemblyPageData {
  projectTitle: string;
  projectStatus: string;
  composition: Composition | null;
  remotionProps: AssemblyRemotionProps;
  /**
   * Catalogue of every accepted segment with a stored media asset. Drives
   * the future "bin" sidebar (PR B). For now also used by the action layer
   * to validate persisted placements against existing segments.
   */
  availableSegments: AssemblySegmentClip[];
  missingAcceptedSegments: SeedanceSegment[];
  audioTrack: AssemblyAudioTrack | null;
  finalExports: MediaAsset[];
  timelineState: AssemblyTimelineState;
  placements: SegmentPlacement[];
}

export async function getAssemblyPageData(
  videoId: string,
): Promise<AssemblyPageData> {
  const supabase = createSupabaseAdminClient();
  const [project, segments, mediaAssets, composition] = await Promise.all([
    getVideoProjectById(supabase, videoId),
    listSegmentsByVideoId(supabase, videoId),
    listMediaAssetsByVideoId(supabase, videoId),
    getLatestCompositionByVideoId(supabase, videoId),
  ]);

  const acceptedSegments = segments.filter(
    (segment) => segment.status === "accepted",
  );
  const audioTrack = await buildAudioTrack(
    mediaAssets,
    composition?.audioMediaAssetId ?? null,
  );

  // Build the catalogue of available segments (one entry per segmentId).
  const availableEntries = await buildSegmentCatalogue(
    acceptedSegments,
    mediaAssets,
  );
  const availableBySegmentId = new Map(
    availableEntries.map((entry) => [entry.segmentId, entry]),
  );
  const availableDurations = new Map(
    availableEntries.map((entry) => [entry.segmentId, entry.durationSeconds]),
  );

  const missingAcceptedSegments = acceptedSegments.filter(
    (segment) => !availableBySegmentId.has(segment.id),
  );

  // Decode placements from compositions.segment_order (tolerant of three
  // legacy shapes — see readPlacementsState).
  const persistedPlacements = readPlacementsState(
    composition?.segmentOrder ?? null,
    composition?.audioSync ?? null,
    availableDurations,
  );
  const placements =
    persistedPlacements.length > 0
      ? persistedPlacements
      : defaultPlacementsForSegments(
          availableEntries.map((entry) => ({
            segmentId: entry.segmentId,
            durationSeconds: entry.durationSeconds,
          })),
        );

  // Build the timeline-side audio state (just audioClips post-PR A).
  const persistedTimelineState = readTimelineState(
    composition?.audioSync ?? null,
    {
      audioMediaAssetId: composition?.audioMediaAssetId,
      audioDurationSeconds: audioTrack?.durationSeconds,
    },
  );
  const seededAudioClips = ensureAudioClipForLinkedTrack(
    persistedTimelineState.audioClips,
    audioTrack,
  );
  const timelineState: AssemblyTimelineState = {
    schema: "timeline_v2",
    audioClips: seededAudioClips,
  };

  // Hydrate placements into runtime AssemblySegmentClip[] for the editor.
  const orderedSegments = buildClipsFromPlacements(
    placements,
    availableBySegmentId,
  );

  // Surface the catalogue as a list of AssemblySegmentClip[] for any
  // consumer that needs the sidebar bin shape. Each catalogue entry is
  // wrapped as a placement covering the full source — purely for typing,
  // these never end up on the timeline unless the user drags one in.
  const availableSegments: AssemblySegmentClip[] = availableEntries.map(
    (entry, index) => ({
      ...entry,
      placementId: `bin_${entry.segmentId}_${index}`,
      position: index,
      inSeconds: 0,
      outSeconds: entry.durationSeconds,
    }),
  );

  const remotionProps = buildRemotionProps({
    segments: orderedSegments,
    audioTrack,
    audioClips: timelineState.audioClips,
  });

  return {
    projectTitle: project?.title ?? "Assembly",
    projectStatus: project?.status ?? "assembling",
    composition,
    remotionProps,
    availableSegments,
    missingAcceptedSegments,
    audioTrack,
    finalExports: mediaAssets.filter((asset) => asset.type === "final_export"),
    timelineState,
    placements,
  };
}

export function buildRemotionProps(input: {
  segments: AssemblySegmentClip[];
  audioTrack: AssemblyAudioTrack | null;
  audioClips: AssemblyAudioClip[];
}): AssemblyRemotionProps {
  return {
    fps: DEFAULT_FPS,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    segments: input.segments,
    audio: input.audioTrack,
    audioSync: legacyFromAudioClips(input.audioClips),
    audioClips: input.audioClips,
  };
}

function legacyFromAudioClips(
  audioClips: AssemblyAudioClip[],
): AssemblyAudioSync {
  if (audioClips.length === 0) {
    return getDefaultAudioSync();
  }
  return projectLegacyAudioSync(audioClips);
}

function ensureAudioClipForLinkedTrack(
  audioClips: AssemblyAudioClip[],
  audioTrack: AssemblyAudioTrack | null,
): AssemblyAudioClip[] {
  if (!audioTrack) {
    return audioClips;
  }
  if (
    audioClips.some((clip) => clip.mediaAssetId === audioTrack.mediaAssetId)
  ) {
    return audioClips;
  }
  const seeded = createDefaultAudioClip({
    mediaAssetId: audioTrack.mediaAssetId,
    durationSeconds: audioTrack.durationSeconds,
  });
  return [...audioClips, seeded];
}

async function buildSegmentCatalogue(
  acceptedSegments: SeedanceSegment[],
  mediaAssets: MediaAsset[],
): Promise<SegmentCatalogueEntry[]> {
  const entries: SegmentCatalogueEntry[] = [];
  for (const segment of acceptedSegments) {
    const mediaAsset = selectSegmentSourceAsset(segment, mediaAssets);
    if (!mediaAsset?.storageBucket || !mediaAsset.storagePath) {
      continue;
    }
    const durationSeconds =
      mediaAsset.durationSeconds ?? segment.durationTarget ?? 5;
    entries.push({
      segmentId: segment.id,
      mediaAssetId: mediaAsset.id,
      generationId: mediaAsset.generationId,
      title: segment.title,
      durationSeconds,
      sourceUrl: await createStorageSignedUrlForAsset(mediaAsset),
      storageBucket: mediaAsset.storageBucket,
      storagePath: mediaAsset.storagePath,
    });
  }
  return entries;
}

async function buildAudioTrack(
  mediaAssets: MediaAsset[],
  preferredAudioMediaAssetId: string | null,
): Promise<AssemblyAudioTrack | null> {
  const preferred = preferredAudioMediaAssetId
    ? mediaAssets.find(
        (asset) =>
          asset.id === preferredAudioMediaAssetId &&
          asset.type === "suno_audio" &&
          asset.storageBucket &&
          asset.storagePath,
      )
    : undefined;

  const audioAsset =
    preferred ??
    mediaAssets.find(
      (asset) =>
        asset.type === "suno_audio" && asset.storageBucket && asset.storagePath,
    );

  if (!audioAsset?.storageBucket || !audioAsset.storagePath) {
    return null;
  }

  return {
    mediaAssetId: audioAsset.id,
    title: audioAsset.originalFilename ?? "Suno audio",
    sourceUrl: await createStorageSignedUrlForAsset(audioAsset),
    durationSeconds: audioAsset.durationSeconds,
  };
}

function selectSegmentSourceAsset(
  segment: SeedanceSegment,
  mediaAssets: MediaAsset[],
) {
  const candidates = mediaAssets.filter(
    (asset) =>
      asset.segmentId === segment.id &&
      asset.storageBucket &&
      asset.storagePath &&
      (asset.type === "accepted_clip" || asset.type === "runway_output"),
  );

  return (
    candidates.find(
      (asset) =>
        asset.type === "accepted_clip" &&
        asset.generationId === segment.selectedGenerationId,
    ) ??
    candidates.find((asset) => asset.type === "accepted_clip") ??
    candidates.find(
      (asset) =>
        asset.type === "runway_output" &&
        asset.generationId === segment.selectedGenerationId,
    ) ??
    candidates[0]
  );
}

async function createStorageSignedUrlForAsset(mediaAsset: MediaAsset) {
  return createStorageSignedUrl(createSupabaseAdminClient(), {
    bucket: mediaAsset.storageBucket as MediaStorageBucket,
    path: mediaAsset.storagePath!,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
  });
}
