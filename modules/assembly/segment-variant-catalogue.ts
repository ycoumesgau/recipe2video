import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import type { Generation } from "@/modules/generation/generation.types";
import { segmentHasAcceptedVariant } from "@/modules/storyboard/segment-status";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";

import type { AssemblySegmentClip } from "./assembly.types";

/** Human-readable label for a variant index (1-based). */
export function formatVariantLabel(variantIndex: number): string {
  return `Variant ${variantIndex}`;
}

/**
 * Title shown in the bin, timeline, and Volume & Speed. Appends the variant
 * label when the storyboard slot has more than one playable take.
 */
export function formatAssemblyClipTitle(input: {
  baseTitle: string;
  variantLabel: string;
  variantCountAtPosition: number;
}): string {
  if (input.variantCountAtPosition <= 1) {
    return input.baseTitle;
  }
  return `${input.baseTitle} · ${input.variantLabel}`;
}

export type SegmentCatalogueEntry = Omit<
  AssemblySegmentClip,
  | "placementId"
  | "position"
  | "inSeconds"
  | "outSeconds"
  | "volume"
  | "playbackRate"
>;

type PlayableMediaAsset = MediaAsset & {
  storageBucket: string;
  storagePath: string;
};

function isPlayableSegmentMedia(asset: MediaAsset): asset is PlayableMediaAsset {
  return (
    Boolean(asset.storageBucket && asset.storagePath) &&
    (asset.type === "accepted_clip" || asset.type === "runway_output")
  );
}

function resolveMediaForGeneration(
  generation: Generation,
  mediaAssets: MediaAsset[],
): PlayableMediaAsset | null {
  const byId = generation.mediaAssetId
    ? mediaAssets.find((asset) => asset.id === generation.mediaAssetId)
    : null;
  if (byId && isPlayableSegmentMedia(byId)) {
    return byId;
  }
  const byGeneration = mediaAssets.find(
    (asset): asset is PlayableMediaAsset =>
      asset.generationId === generation.id && isPlayableSegmentMedia(asset),
  );
  return byGeneration ?? null;
}

/**
 * Build one catalogue row per playable generation variant, grouped by
 * storyboard {@link SeedanceSegment.position}. Positions with at least one
 * accepted segment and stored media are included; variants come from every
 * succeeded generation on peer segment rows at that position.
 */
export function buildSegmentVariantCatalogue(input: {
  allSegments: SeedanceSegment[];
  acceptedSegments: SeedanceSegment[];
  generations: Generation[];
  mediaAssets: MediaAsset[];
  conversationNameBySegmentId: Map<string, string>;
}): SegmentCatalogueEntry[] {
  const acceptedWithPlayable = input.acceptedSegments
    .map((segment) => ({
      segment,
      primaryAsset: selectPrimaryAssetForSegment(segment, input.mediaAssets),
    }))
    .filter(
      (row): row is { segment: SeedanceSegment; primaryAsset: PlayableMediaAsset } =>
        row.primaryAsset !== null,
    );

  if (acceptedWithPlayable.length === 0) {
    return [];
  }

  const positions = [
    ...new Set(acceptedWithPlayable.map((row) => row.segment.position)),
  ].sort((left, right) => left - right);

  const segmentsByPosition = new Map<number, SeedanceSegment[]>();
  for (const segment of input.allSegments) {
    const bucket = segmentsByPosition.get(segment.position) ?? [];
    bucket.push(segment);
    segmentsByPosition.set(segment.position, bucket);
  }

  const generationsBySegmentId = new Map<string, Generation[]>();
  for (const generation of input.generations) {
    if (generation.status !== "succeeded") {
      continue;
    }
    const bucket = generationsBySegmentId.get(generation.segmentId) ?? [];
    bucket.push(generation);
    generationsBySegmentId.set(generation.segmentId, bucket);
  }

  const entries: SegmentCatalogueEntry[] = [];

  for (const position of positions) {
    const peerSegments = segmentsByPosition.get(position) ?? [];
    const peerSegmentIds = new Set(peerSegments.map((segment) => segment.id));
    const acceptedAtPosition = acceptedWithPlayable.filter(
      (row) => row.segment.position === position,
    );
    const activeGenerationIds = new Set(
      acceptedAtPosition
        .map((row) => row.segment.selectedGenerationId)
        .filter((id): id is string => Boolean(id)),
    );
    // Also treat the primary accepted_clip on each accepted row as active.
    for (const row of acceptedAtPosition) {
      const genId = row.primaryAsset.generationId;
      if (genId) {
        activeGenerationIds.add(genId);
      }
    }

    type VariantCandidate = {
      segment: SeedanceSegment;
      generation: Generation | null;
      mediaAsset: PlayableMediaAsset;
      createdAtMs: number;
    };

    const candidates: VariantCandidate[] = [];
    const seenMediaAssetIds = new Set<string>();

    const pushCandidate = (candidate: VariantCandidate) => {
      if (seenMediaAssetIds.has(candidate.mediaAsset.id)) {
        return;
      }
      seenMediaAssetIds.add(candidate.mediaAsset.id);
      candidates.push(candidate);
    };

    for (const segment of peerSegments) {
      const segmentGenerations = generationsBySegmentId.get(segment.id) ?? [];
      for (const generation of segmentGenerations) {
        const media = resolveMediaForGeneration(generation, input.mediaAssets);
        if (!media || !peerSegmentIds.has(generation.segmentId)) {
          continue;
        }
        pushCandidate({
          segment,
          generation,
          mediaAsset: media,
          createdAtMs: Date.parse(generation.createdAt ?? "") || 0,
        });
      }
      // Primary asset on accepted segment without a generation row in the list.
      const primary = selectPrimaryAssetForSegment(segment, input.mediaAssets);
      if (primary && segment.status === "accepted") {
        pushCandidate({
          segment,
          generation: null,
          mediaAsset: primary,
          createdAtMs: Date.parse(segment.updatedAt ?? segment.createdAt ?? "") || 0,
        });
      }
    }

    if (candidates.length === 0) {
      continue;
    }

    candidates.sort((left, right) => {
      const leftActive =
        left.generation?.id != null &&
        activeGenerationIds.has(left.generation.id);
      const rightActive =
        right.generation?.id != null &&
        activeGenerationIds.has(right.generation.id);
      if (leftActive !== rightActive) {
        return leftActive ? -1 : 1;
      }
      return right.createdAtMs - left.createdAtMs;
    });

    const variantCountAtPosition = candidates.length;
    const anchorSegment = acceptedAtPosition[0]?.segment ?? candidates[0]!.segment;
    const conversationName =
      input.conversationNameBySegmentId.get(anchorSegment.id) ?? null;
    const baseTitle = `S${position}. ${anchorSegment.title}`;
    const storyboardTitle = conversationName
      ? `${baseTitle} · ${conversationName}`
      : baseTitle;

    candidates.forEach((candidate, index) => {
      const variantIndex = index + 1;
      const variantLabel = formatVariantLabel(variantIndex);
      const isActiveVariant =
        candidate.generation?.id != null &&
        activeGenerationIds.has(candidate.generation.id);
      entries.push({
        segmentId: candidate.segment.id,
        mediaAssetId: candidate.mediaAsset.id,
        generationId: candidate.generation?.id ?? candidate.mediaAsset.generationId,
        title: formatAssemblyClipTitle({
          baseTitle: storyboardTitle,
          variantLabel,
          variantCountAtPosition,
        }),
        storyboardPosition: position,
        variantIndex,
        variantLabel,
        variantCountAtPosition,
        isActiveVariant,
        durationSeconds:
          candidate.mediaAsset.durationSeconds ?? candidate.segment.durationTarget ?? 5,
        sourceUrl: "",
        storageBucket: candidate.mediaAsset.storageBucket,
        storagePath: candidate.mediaAsset.storagePath,
      });
    });
  }

  return entries;
}

/** Groups catalogue entries by storyboard position for the bin layout. */
export function groupCatalogueByStoryboardPosition<T extends SegmentCatalogueEntry>(
  entries: T[],
): Array<{ storyboardPosition: number; variants: T[] }> {
  const byPosition = new Map<number, T[]>();
  for (const entry of entries) {
    const bucket = byPosition.get(entry.storyboardPosition) ?? [];
    bucket.push(entry);
    byPosition.set(entry.storyboardPosition, bucket);
  }
  return [...byPosition.entries()]
    .sort(([left], [right]) => left - right)
    .map(([storyboardPosition, variants]) => ({ storyboardPosition, variants }));
}

function selectPrimaryAssetForSegment(
  segment: SeedanceSegment,
  mediaAssets: MediaAsset[],
): PlayableMediaAsset | null {
  const playable = mediaAssets.filter(isPlayableSegmentMedia);

  const pickBest = (candidates: PlayableMediaAsset[]) =>
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
    candidates[0] ??
    null;

  if (segment.selectedGenerationId) {
    const byGeneration = playable.filter(
      (asset) => asset.generationId === segment.selectedGenerationId,
    );
    const fromGeneration = pickBest(byGeneration);
    if (fromGeneration) {
      return fromGeneration;
    }
  }

  return pickBest(playable.filter((asset) => asset.segmentId === segment.id));
}
