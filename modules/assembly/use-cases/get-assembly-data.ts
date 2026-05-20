import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import { listMediaAssetsByVideoId } from "@/modules/media-assets/repositories/media-asset.repository";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage.service";
import { listSegmentsByVideoId } from "@/modules/storyboard/repositories/segment.repository";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import type {
  AssemblyAudioClip,
  AssemblyAudioSync,
  AssemblyAudioTrack,
  AssemblyPreset,
  AssemblyRemotionProps,
  AssemblySegmentClip,
  AssemblyTimelineState,
  Composition,
  SegmentPlacement,
} from "../assembly.types";
import {
  ASSEMBLY_CANVAS_HEIGHT,
  ASSEMBLY_CANVAS_WIDTH,
  ASSEMBLY_EXPORT_SIGNED_URL_TTL_SECONDS,
} from "../assembly.constants";
import {
  readRenderProgress,
  type RenderProgress,
} from "../render-progress";
import { resolveActivePreset } from "../resolve-active-preset";
import { listPresetsByVideoId } from "../repositories/assembly-presets.repository";
import { getLatestCompositionByPresetId } from "../repositories/assembly.repository";
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
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Lookup table the editor uses on the available-segments side. The fields
 * mirror {@link AssemblySegmentClip} minus the per-placement fields, so we
 * can hydrate any number of placements from a single segment entry.
 *
 * `volume` is also a per-placement field (mixing decision lives on the
 * timeline, not on the source segment), so it is excluded here too.
 */
type SegmentCatalogueEntry = Omit<
  AssemblySegmentClip,
  | "placementId"
  | "position"
  | "inSeconds"
  | "outSeconds"
  | "volume"
  | "playbackRate"
>;

export interface AssemblyFinalExport {
  asset: MediaAsset;
  /** Freshly signed Supabase URL that triggers a browser download. */
  downloadUrl: string;
  presetId?: string | null;
  presetName?: string | null;
}

export interface AssemblyPageData {
  projectTitle: string;
  projectStatus: string;
  presets: AssemblyPreset[];
  activePreset: AssemblyPreset | null;
  activePresetId: string | null;
  composition: Composition | null;
  /** Latest typed snapshot of the cloud-render progress, when one is running. */
  renderProgress: RenderProgress | null;
  remotionProps: AssemblyRemotionProps;
  /**
   * Catalogue of every accepted segment with a stored media asset. Drives
   * the future "bin" sidebar (PR B). For now also used by the action layer
   * to validate persisted placements against existing segments.
   */
  availableSegments: AssemblySegmentClip[];
  missingAcceptedSegments: SeedanceSegment[];
  audioTrack: AssemblyAudioTrack | null;
  /**
   * Past Supabase-stored MP4 exports for this video, newest first. Each entry
   * carries a freshly signed download URL so the UI can render an `<a>`
   * tag without round-tripping through a server action.
   */
  finalExports: AssemblyFinalExport[];
  timelineState: AssemblyTimelineState;
  placements: SegmentPlacement[];
}

export async function getAssemblyPageData(
  videoId: string,
  options: { presetId?: string | null } = {},
): Promise<AssemblyPageData> {
  const supabase = createSupabaseAdminClient();
  const [project, segments, mediaAssets, presets] = await Promise.all([
    getVideoProjectById(supabase, videoId),
    listSegmentsByVideoId(supabase, videoId),
    listMediaAssetsByVideoId(supabase, videoId),
    listPresetsByVideoId(supabase, videoId),
  ]);

  const activePreset = resolveActivePreset(presets, options.presetId);
  const composition = activePreset
    ? await getLatestCompositionByPresetId(supabase, activePreset.id)
    : null;

  const acceptedSegments = segments.filter(
    (segment) => segment.status === "accepted",
  );
  const audioTrack = await buildAudioTrack(
    supabase,
    mediaAssets,
    activePreset?.audioMediaAssetId ??
      composition?.audioMediaAssetId ??
      null,
    SIGNED_URL_TTL_SECONDS,
  );

  // Build the catalogue of available segments (one entry per segmentId).
  const availableEntries = await buildSegmentCatalogue(
    supabase,
    acceptedSegments,
    mediaAssets,
    SIGNED_URL_TTL_SECONDS,
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
    activePreset?.segmentOrder ?? composition?.segmentOrder ?? null,
    activePreset?.audioSync ?? composition?.audioSync ?? null,
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
    activePreset?.audioSync ?? composition?.audioSync ?? null,
    {
      audioMediaAssetId:
        activePreset?.audioMediaAssetId ?? composition?.audioMediaAssetId,
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
      // Bin entries are not on the timeline; the value here is only used as
      // the default volume for placements materialised from this entry.
      volume: 1,
      playbackRate: 1,
    }),
  );

  const remotionProps = buildRemotionProps({
    segments: orderedSegments,
    audioTrack,
    audioClips: timelineState.audioClips,
  });

  const presetNameById = new Map(presets.map((preset) => [preset.id, preset.name]));
  const finalExports = await buildFinalExports(
    supabase,
    mediaAssets,
    SIGNED_URL_TTL_SECONDS,
    presetNameById,
  );

  return {
    projectTitle: project?.title ?? "Assembly",
    projectStatus: project?.status ?? "assembling",
    presets,
    activePreset,
    activePresetId: activePreset?.id ?? null,
    composition,
    renderProgress: readRenderProgress(composition?.renderProgress ?? null),
    remotionProps,
    availableSegments,
    missingAcceptedSegments,
    audioTrack,
    finalExports,
    timelineState,
    placements,
  };
}

/**
 * Build the list of `final_export` media assets with a freshly signed
 * Supabase download URL each, sorted newest first.
 *
 * Failure to sign any single URL drops that export from the list rather than
 * crashing the whole page (e.g. if Storage briefly hiccups on a stale path).
 */
async function buildFinalExports(
  supabase: SupabaseDataClient,
  mediaAssets: MediaAsset[],
  signedUrlTtlSeconds: number,
  presetNameById: Map<string, string>,
) {
  const exports = mediaAssets
    .filter(
      (asset) =>
        asset.type === "final_export" &&
        asset.storageBucket &&
        asset.storagePath,
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const out: AssemblyFinalExport[] = [];
  for (const asset of exports) {
    try {
      const downloadUrl = await createStorageSignedUrl(supabase, {
        bucket: asset.storageBucket as MediaStorageBucket,
        path: asset.storagePath!,
        expiresInSeconds: signedUrlTtlSeconds,
        download: asset.originalFilename ?? true,
      });
      const metadata = asset.metadata as Record<string, unknown> | null;
      const presetId =
        typeof metadata?.presetId === "string" ? metadata.presetId : null;
      out.push({
        asset,
        downloadUrl,
        presetId,
        presetName: presetId ? (presetNameById.get(presetId) ?? null) : null,
      });
    } catch (error) {
      console.error(
        "[getAssemblyPageData] signing download URL failed for media_asset:",
        asset.id,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return out;
}

export function buildRemotionProps(input: {
  segments: AssemblySegmentClip[];
  audioTrack: AssemblyAudioTrack | null;
  audioClips: AssemblyAudioClip[];
  /** Defaults to true (editor preview). Cloud export passes false. */
  showSegmentTitles?: boolean;
}): AssemblyRemotionProps {
  return {
    fps: DEFAULT_FPS,
    width: ASSEMBLY_CANVAS_WIDTH,
    height: ASSEMBLY_CANVAS_HEIGHT,
    segments: input.segments,
    audio: input.audioTrack,
    audioSync: legacyFromAudioClips(input.audioClips),
    audioClips: input.audioClips,
    showSegmentTitles: input.showSegmentTitles ?? true,
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
  supabase: SupabaseDataClient,
  acceptedSegments: SeedanceSegment[],
  mediaAssets: MediaAsset[],
  signedUrlTtlSeconds: number,
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
      // Match the rest of the app (segment-review, storyboard, etc.) that
      // formats segment names as "S{position}. {title}" so the user can
      // tell at a glance which storyboard slot a clip came from. The
      // `position` we read here is the storyboard position (1-indexed),
      // not the timeline position which can change with reorders.
      title: `S${segment.position}. ${segment.title}`,
      durationSeconds,
      sourceUrl: await createStorageSignedUrlForAsset(
        supabase,
        mediaAsset,
        signedUrlTtlSeconds,
      ),
      storageBucket: mediaAsset.storageBucket,
      storagePath: mediaAsset.storagePath,
    });
  }
  return entries;
}

async function buildAudioTrack(
  supabase: SupabaseDataClient,
  mediaAssets: MediaAsset[],
  preferredAudioMediaAssetId: string | null,
  signedUrlTtlSeconds: number,
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
    sourceUrl: await createStorageSignedUrlForAsset(
      supabase,
      audioAsset,
      signedUrlTtlSeconds,
    ),
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

async function createStorageSignedUrlForAsset(
  supabase: SupabaseDataClient,
  mediaAsset: MediaAsset,
  expiresInSeconds: number,
) {
  return createStorageSignedUrl(supabase, {
    bucket: mediaAsset.storageBucket as MediaStorageBucket,
    path: mediaAsset.storagePath!,
    expiresInSeconds,
  });
}

/**
 * Builds {@link AssemblyRemotionProps} for a **specific** composition row with
 * freshly signed Supabase URLs (longer TTL for cloud export).
 */
export async function buildRemotionPropsForCompositionRow(
  supabase: SupabaseDataClient,
  videoId: string,
  composition: Composition,
): Promise<AssemblyRemotionProps> {
  if (composition.videoId !== videoId) {
    throw new Error("Composition does not belong to this video project.");
  }

  const [segments, mediaAssets] = await Promise.all([
    listSegmentsByVideoId(supabase, videoId),
    listMediaAssetsByVideoId(supabase, videoId),
  ]);

  const acceptedSegments = segments.filter(
    (segment) => segment.status === "accepted",
  );
  const audioTrack = await buildAudioTrack(
    supabase,
    mediaAssets,
    composition.audioMediaAssetId ?? null,
    ASSEMBLY_EXPORT_SIGNED_URL_TTL_SECONDS,
  );

  const availableEntries = await buildSegmentCatalogue(
    supabase,
    acceptedSegments,
    mediaAssets,
    ASSEMBLY_EXPORT_SIGNED_URL_TTL_SECONDS,
  );
  const availableBySegmentId = new Map(
    availableEntries.map((entry) => [entry.segmentId, entry]),
  );
  const availableDurations = new Map(
    availableEntries.map((entry) => [entry.segmentId, entry.durationSeconds]),
  );

  const persistedPlacements = readPlacementsState(
    composition.segmentOrder,
    composition.audioSync,
    availableDurations,
  );
  if (persistedPlacements.length === 0) {
    throw new Error("Composition has no segment placements to render.");
  }

  const persistedTimelineState = readTimelineState(
    composition.audioSync ?? null,
    {
      audioMediaAssetId: composition.audioMediaAssetId,
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

  const orderedSegments = buildClipsFromPlacements(
    persistedPlacements,
    availableBySegmentId,
  );

  return buildRemotionProps({
    segments: orderedSegments,
    audioTrack,
    audioClips: timelineState.audioClips,
    showSegmentTitles: false,
  });
}
