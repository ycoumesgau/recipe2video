import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import { listMediaAssetsByVideoId } from "@/modules/media-assets/repositories/media-asset.repository";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage.service";
import { listSegmentsByVideoId } from "@/modules/storyboard/repositories/segment.repository";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

import type {
  AssemblyAudioSync,
  AssemblyAudioTrack,
  AssemblyRemotionProps,
  AssemblySegmentClip,
  Composition,
} from "../assembly.types";
import { getLatestCompositionByVideoId } from "../repositories/assembly.repository";

const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 1280;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface AssemblyPageData {
  projectTitle: string;
  projectStatus: string;
  composition: Composition | null;
  remotionProps: AssemblyRemotionProps;
  availableSegments: AssemblySegmentClip[];
  missingAcceptedSegments: SeedanceSegment[];
  audioTrack: AssemblyAudioTrack | null;
  finalExports: MediaAsset[];
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

  const acceptedSegments = segments.filter((segment) => segment.status === "accepted");
  const audioTrack = await buildAudioTrack(
    mediaAssets,
    composition?.audioMediaAssetId ?? null,
  );
  const availableSegments = await buildAssemblySegments(
    acceptedSegments,
    mediaAssets,
  );
  const missingAcceptedSegments = acceptedSegments.filter(
    (segment) =>
      !availableSegments.some((clip) => clip.segmentId === segment.id),
  );
  const orderedSegments = orderSegments(
    availableSegments,
    readSegmentOrder(composition),
  );
  const audioSync = readAudioSync(composition);
  const remotionProps = buildRemotionProps({
    segments: orderedSegments,
    audioTrack,
    audioSync,
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
  };
}

export function buildRemotionProps(input: {
  segments: AssemblySegmentClip[];
  audioTrack: AssemblyAudioTrack | null;
  audioSync: AssemblyAudioSync;
}): AssemblyRemotionProps {
  return {
    fps: DEFAULT_FPS,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    segments: input.segments,
    audio: input.audioTrack,
    audioSync: input.audioSync,
  };
}

export function getDefaultAudioSync(): AssemblyAudioSync {
  return {
    offsetSeconds: 0,
    cutFromSeconds: 0,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
  };
}

async function buildAssemblySegments(
  acceptedSegments: SeedanceSegment[],
  mediaAssets: MediaAsset[],
): Promise<AssemblySegmentClip[]> {
  const clips: AssemblySegmentClip[] = [];

  for (const segment of acceptedSegments) {
    const mediaAsset = selectSegmentSourceAsset(segment, mediaAssets);

    if (!mediaAsset?.storageBucket || !mediaAsset.storagePath) {
      continue;
    }

    clips.push({
      segmentId: segment.id,
      mediaAssetId: mediaAsset.id,
      generationId: mediaAsset.generationId,
      title: segment.title,
      position: segment.position,
      durationSeconds:
        mediaAsset.durationSeconds ?? segment.durationTarget ?? 5,
      sourceUrl: await createStorageSignedUrlForAsset(mediaAsset),
      storageBucket: mediaAsset.storageBucket,
      storagePath: mediaAsset.storagePath,
    });
  }

  return clips;
}

async function buildAudioTrack(
  mediaAssets: MediaAsset[],
  preferredAudioMediaAssetId: string | null,
): Promise<AssemblyAudioTrack | null> {
  // Prefer the audio asset explicitly linked on the composition; fall back to
  // the first stored Suno audio if the user has not picked one yet (e.g. they
  // uploaded a track but never opened the assembly screen).
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

function orderSegments(
  segments: AssemblySegmentClip[],
  segmentOrder: string[],
) {
  if (segmentOrder.length === 0) {
    return [...segments].sort((a, b) => a.position - b.position);
  }

  const segmentById = new Map(segments.map((segment) => [segment.segmentId, segment]));
  const ordered = segmentOrder
    .map((segmentId) => segmentById.get(segmentId))
    .filter((segment): segment is AssemblySegmentClip => Boolean(segment));
  const remaining = segments.filter(
    (segment) => !segmentOrder.includes(segment.segmentId),
  );

  return [...ordered, ...remaining.sort((a, b) => a.position - b.position)];
}

function readSegmentOrder(composition: Composition | null) {
  const value = composition?.segmentOrder;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readAudioSync(composition: Composition | null): AssemblyAudioSync {
  const value = composition?.audioSync;
  const defaults = getDefaultAudioSync();

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    offsetSeconds: readNumber(value.offsetSeconds, defaults.offsetSeconds),
    cutFromSeconds: readNumber(value.cutFromSeconds, defaults.cutFromSeconds),
    fadeInSeconds: readNumber(value.fadeInSeconds, defaults.fadeInSeconds),
    fadeOutSeconds: readNumber(value.fadeOutSeconds, defaults.fadeOutSeconds),
  };
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function createStorageSignedUrlForAsset(mediaAsset: MediaAsset) {
  return createStorageSignedUrl(createSupabaseAdminClient(), {
    bucket: mediaAsset.storageBucket as MediaStorageBucket,
    path: mediaAsset.storagePath!,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
  });
}
