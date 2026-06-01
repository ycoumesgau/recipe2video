import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import { listMediaAssetsByVideoId } from "@/modules/media-assets/repositories/media-asset.repository";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage.service";
import { listGenerationsBySegmentIds } from "@/modules/generation/repositories/generation.repository";
import { listSegmentsByVideoId } from "@/modules/storyboard/repositories/segment.repository";
import { segmentHasAcceptedVariant } from "@/modules/storyboard/segment-status";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import type {
  AssemblyAudioTrack,
  AssemblyPreset,
  AssemblyRemotionProps,
  AssemblySegmentClip,
  AssemblyTimelineState,
  Composition,
  SegmentPlacement,
} from "../assembly.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import { buildRemotionProps } from "../build-remotion-props";
import { ASSEMBLY_EXPORT_SIGNED_URL_TTL_SECONDS } from "../assembly.constants";
import {
  readRenderProgress,
  type RenderProgress,
} from "../render-progress";
import { resolveActivePreset } from "../resolve-active-preset";
import {
  getPresetById,
  listPresetsByVideoId,
} from "../repositories/assembly-presets.repository";
import { getLatestCompositionByPresetId } from "../repositories/assembly.repository";
import {
  buildSegmentVariantCatalogue,
  type SegmentCatalogueEntry,
} from "../segment-variant-catalogue";
import {
  buildClipsFromPlacements,
  defaultPlacementsForSegments,
  ensureLinkedAudioClipOnTimeline,
  hasExplicitNoMusicTimeline,
  readPlacementsState,
  readTimelineState,
  resolveLinkedAudioMediaAssetId,
} from "../timeline-state";

export { getDefaultAudioSync, getEmptyTimelineState } from "../timeline-state";

/** Assembly mixes every accepted segment for the video, not only the active conversation. */
const ASSEMBLY_SEGMENT_SCOPE = { activeOnly: false } as const;

const SIGNED_URL_TTL_SECONDS = 60 * 60;

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
    listSegmentsByVideoId(supabase, videoId, ASSEMBLY_SEGMENT_SCOPE),
    listMediaAssetsByVideoId(supabase, videoId),
    listPresetsByVideoId(supabase, videoId),
  ]);

  const acceptedSegments = segments.filter((segment) =>
    segmentHasAcceptedVariant(segment),
  );
  const conversationNameBySegmentId = await loadConversationNamesBySegmentIds(
    supabase,
    segments.map((segment) => segment.id),
  );
  const generations = await listGenerationsBySegmentIds(
    supabase,
    segments.map((segment) => segment.id),
  );

  const activePreset = resolveActivePreset(presets, options.presetId);
  const composition = activePreset
    ? await getLatestCompositionByPresetId(supabase, activePreset.id)
    : null;

  const persistedAudioMediaAssetId =
    activePreset?.audioMediaAssetId ?? composition?.audioMediaAssetId ?? null;

  const catalogueEntries = buildSegmentVariantCatalogue({
    allSegments: segments,
    acceptedSegments,
    generations,
    mediaAssets,
    conversationNameBySegmentId,
  });
  const availableEntries = await hydrateCatalogueSignedUrls(
    supabase,
    catalogueEntries,
    SIGNED_URL_TTL_SECONDS,
  );
  const availableBySegmentId = new Map(
    availableEntries.map((entry) => [entry.segmentId, entry]),
  );
  const availableByMediaAssetId = new Map(
    availableEntries.map((entry) => [entry.mediaAssetId, entry]),
  );
  const availableDurations = new Map<string, number>();
  for (const entry of availableEntries) {
    availableDurations.set(entry.segmentId, entry.durationSeconds);
    availableDurations.set(entry.mediaAssetId, entry.durationSeconds);
  }

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
          pickDefaultPlacementSources(availableEntries).map((entry) => ({
            segmentId: entry.segmentId,
            mediaAssetId: entry.mediaAssetId,
            durationSeconds: entry.durationSeconds,
          })),
        );

  const audioSyncJson =
    activePreset?.audioSync ?? composition?.audioSync ?? null;
  const linkedAudioAsset = persistedAudioMediaAssetId
    ? mediaAssets.find((asset) => asset.id === persistedAudioMediaAssetId)
    : undefined;

  // Build the timeline-side audio state (just audioClips post-PR A).
  const persistedTimelineState = readTimelineState(audioSyncJson, {
    audioMediaAssetId: persistedAudioMediaAssetId,
    audioDurationSeconds: linkedAudioAsset?.durationSeconds ?? null,
  });
  const timelineState: AssemblyTimelineState = hasExplicitNoMusicTimeline(
    audioSyncJson,
  )
    ? {
        schema: "timeline_v2",
        audioClips: persistedTimelineState.audioClips,
      }
    : ensureLinkedAudioClipOnTimeline(
        {
          schema: "timeline_v2",
          audioClips: persistedTimelineState.audioClips,
        },
        {
          audioMediaAssetId: persistedAudioMediaAssetId,
          audioDurationSeconds: linkedAudioAsset?.durationSeconds ?? null,
        },
      );

  const linkedAudioMediaAssetId = resolveLinkedAudioMediaAssetId(
    timelineState.audioClips,
    persistedAudioMediaAssetId,
  );
  const audioTrack = await buildAudioTrack(
    supabase,
    mediaAssets,
    linkedAudioMediaAssetId,
    SIGNED_URL_TTL_SECONDS,
  );

  // Hydrate placements into runtime AssemblySegmentClip[] for the editor.
  const orderedSegments = buildClipsFromPlacements(
    placements,
    availableBySegmentId,
    availableByMediaAssetId,
  );

  // Surface the catalogue as a list of AssemblySegmentClip[] for any
  // consumer that needs the sidebar bin shape. Each catalogue entry is
  // wrapped as a placement covering the full source — purely for typing,
  // these never end up on the timeline unless the user drags one in.
  const availableSegments: AssemblySegmentClip[] = availableEntries.map(
    (entry, index) => ({
      ...entry,
      placementId: `bin_${entry.mediaAssetId}_${index}`,
      position: index,
      inSeconds: 0,
      outSeconds: entry.durationSeconds,
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

export { buildRemotionProps } from "../build-remotion-props";

function pickDefaultPlacementSources(entries: SegmentCatalogueEntry[]) {
  const byPosition = new Map<number, SegmentCatalogueEntry>();
  for (const entry of entries) {
    const existing = byPosition.get(entry.storyboardPosition);
    if (!existing || entry.isActiveVariant) {
      byPosition.set(entry.storyboardPosition, entry);
    }
  }
  return [...byPosition.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, entry]) => entry);
}

async function hydrateCatalogueSignedUrls(
  supabase: SupabaseDataClient,
  entries: SegmentCatalogueEntry[],
  signedUrlTtlSeconds: number,
): Promise<SegmentCatalogueEntry[]> {
  const hydrated: SegmentCatalogueEntry[] = [];
  for (const entry of entries) {
    hydrated.push({
      ...entry,
      sourceUrl: await createStorageSignedUrl(supabase, {
        bucket: entry.storageBucket as MediaStorageBucket,
        path: entry.storagePath,
        expiresInSeconds: signedUrlTtlSeconds,
      }),
    });
  }
  return hydrated;
}

async function buildAudioTrack(
  supabase: SupabaseDataClient,
  mediaAssets: MediaAsset[],
  preferredAudioMediaAssetId: string | null,
  signedUrlTtlSeconds: number,
): Promise<AssemblyAudioTrack | null> {
  if (!preferredAudioMediaAssetId) {
    return null;
  }

  const audioAsset = mediaAssets.find(
    (asset) =>
      asset.id === preferredAudioMediaAssetId &&
      asset.type === "suno_audio" &&
      asset.storageBucket &&
      asset.storagePath,
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
  options: { presetId?: string | null } = {},
): Promise<AssemblyRemotionProps> {
  if (composition.videoId !== videoId) {
    throw new Error("Composition does not belong to this video project.");
  }

  const presetId = composition.presetId ?? options.presetId ?? null;
  const preset =
    presetId != null ? await getPresetById(supabase, presetId) : null;

  if (presetId && !preset) {
    throw new Error(
      `Assembly preset ${presetId} was not found for this render job.`,
    );
  }

  const segmentOrderJson = preset?.segmentOrder ?? composition.segmentOrder;
  const audioSyncJson = preset?.audioSync ?? composition.audioSync;
  const persistedAudioMediaAssetId =
    preset?.audioMediaAssetId ?? composition.audioMediaAssetId ?? null;

  const [segments, mediaAssets] = await Promise.all([
    listSegmentsByVideoId(supabase, videoId, ASSEMBLY_SEGMENT_SCOPE),
    listMediaAssetsByVideoId(supabase, videoId),
  ]);

  const acceptedSegments = segments.filter((segment) =>
    segmentHasAcceptedVariant(segment),
  );
  const conversationNameBySegmentId = await loadConversationNamesBySegmentIds(
    supabase,
    segments.map((segment) => segment.id),
  );
  const generations = await listGenerationsBySegmentIds(
    supabase,
    segments.map((segment) => segment.id),
  );

  const catalogueEntries = buildSegmentVariantCatalogue({
    allSegments: segments,
    acceptedSegments,
    generations,
    mediaAssets,
    conversationNameBySegmentId,
  });
  const availableEntries = await hydrateCatalogueSignedUrls(
    supabase,
    catalogueEntries,
    ASSEMBLY_EXPORT_SIGNED_URL_TTL_SECONDS,
  );
  const availableBySegmentId = new Map(
    availableEntries.map((entry) => [entry.segmentId, entry]),
  );
  const availableByMediaAssetId = new Map(
    availableEntries.map((entry) => [entry.mediaAssetId, entry]),
  );
  const availableDurations = new Map<string, number>();
  for (const entry of availableEntries) {
    availableDurations.set(entry.segmentId, entry.durationSeconds);
    availableDurations.set(entry.mediaAssetId, entry.durationSeconds);
  }

  const persistedPlacements = readPlacementsState(
    segmentOrderJson,
    audioSyncJson,
    availableDurations,
  );
  if (persistedPlacements.length === 0) {
    const label = preset?.name ?? composition.presetId ?? composition.id;
    throw new Error(
      `Assembly preset "${label}" has no segment placements to render.`,
    );
  }

  const linkedAudioAsset = persistedAudioMediaAssetId
    ? mediaAssets.find((asset) => asset.id === persistedAudioMediaAssetId)
    : undefined;

  const persistedTimelineState = readTimelineState(audioSyncJson ?? null, {
    audioMediaAssetId: persistedAudioMediaAssetId,
    audioDurationSeconds: linkedAudioAsset?.durationSeconds ?? null,
  });
  const timelineState: AssemblyTimelineState = hasExplicitNoMusicTimeline(
    audioSyncJson,
  )
    ? {
        schema: "timeline_v2",
        audioClips: persistedTimelineState.audioClips,
      }
    : ensureLinkedAudioClipOnTimeline(
        {
          schema: "timeline_v2",
          audioClips: persistedTimelineState.audioClips,
        },
        {
          audioMediaAssetId: persistedAudioMediaAssetId,
          audioDurationSeconds: linkedAudioAsset?.durationSeconds ?? null,
        },
      );

  const linkedAudioMediaAssetId = resolveLinkedAudioMediaAssetId(
    timelineState.audioClips,
    persistedAudioMediaAssetId,
  );
  const audioTrack = await buildAudioTrack(
    supabase,
    mediaAssets,
    linkedAudioMediaAssetId,
    ASSEMBLY_EXPORT_SIGNED_URL_TTL_SECONDS,
  );

  const orderedSegments = buildClipsFromPlacements(
    persistedPlacements,
    availableBySegmentId,
    availableByMediaAssetId,
  );
  if (orderedSegments.length === 0) {
    const label = preset?.name ?? composition.presetId ?? composition.id;
    throw new Error(
      `Assembly preset "${label}" has placements but no playable segment clips (check accepted clips in storage).`,
    );
  }

  return buildRemotionProps({
    segments: orderedSegments,
    audioTrack,
    audioClips: timelineState.audioClips,
    showSegmentTitles: false,
  });
}

async function loadConversationNamesBySegmentIds(
  supabase: SupabaseDataClient,
  segmentIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (segmentIds.length === 0) {
    return names;
  }

  const { data, error } = await supabase
    .from("segments")
    .select("id, agent_conversations(name)")
    .in("id", segmentIds);

  throwIfSupabaseError(error, "loadConversationNamesBySegmentIds failed");

  for (const row of data ?? []) {
    const joined = row.agent_conversations as { name?: string } | null;
    if (joined?.name) {
      names.set(row.id, joined.name);
    }
  }

  return names;
}
