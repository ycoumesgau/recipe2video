import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { listAssetLibrary } from "@/modules/references/repositories/asset-library.repository";
import { listReferenceAssetsForVideo } from "@/modules/references/repositories/reference.repository";
import { listSegmentsByVideoId } from "@/modules/storyboard/repositories/segment.repository";
import { getMediaAssetById } from "@/modules/media-assets/repositories/media-asset.repository";
import {
  createStorageSignedUrl,
  tryCreateStorageSignedUrl,
} from "@/modules/media-assets/services/storage-signed-url";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";

import { buildAvailableAssetsManifestPath } from "../agent-conversation.utils";
import {
  ensureGithubBranchExists,
  pushFileToAgentWorkspace,
  resolveAgentWorkspaceTarget,
} from "@/modules/library/services/agent-workspace-github";

const MANIFEST_SIGNED_URL_TTL_SECONDS = 15 * 60;

export interface AvailableAssetsManifest {
  schema: "available_assets_v1";
  generatedAt: string;
  videoId: string;
  fromConversationId?: string | null;
  references: Array<{
    canonicalName: string;
    role: string;
    description: string;
    tags: string[];
    url: string | null;
    runwayUri: string | null;
    source: "asset_library" | "recipe_reference";
  }>;
  videoSegments: Array<{
    title: string;
    description: string;
    durationSeconds: number | null;
    url: string | null;
    mediaAssetId: string | null;
    previousSegmentTitle: string | null;
  }>;
}

export async function buildAvailableAssetsManifest(
  supabase: SupabaseDataClient,
  input: {
    videoId: string;
    fromConversationId?: string | null;
  },
): Promise<AvailableAssetsManifest> {
  const [recipeReferences, libraryEntries, segments] = await Promise.all([
    listReferenceAssetsForVideo(supabase, input.videoId),
    listAssetLibrary(supabase),
    listSegmentsByVideoId(supabase, input.videoId, { activeOnly: false }),
  ]);

  const generatedReferenceStatuses = new Set([
    "generated",
    "approved",
    "uploaded_to_runway",
  ]);

  const references: AvailableAssetsManifest["references"] = [];

  for (const entry of libraryEntries) {
    if (!entry.mediaAssetId) {
      continue;
    }

    const mediaAsset = await getMediaAssetById(supabase, entry.mediaAssetId);
    const url = mediaAsset
      ? await trySignMediaAsset(supabase, mediaAsset.storageBucket, mediaAsset.storagePath)
      : null;

    references.push({
      canonicalName: entry.canonicalName,
      role: entry.category,
      description: entry.description ?? entry.canonicalName,
      tags: entry.aliases ?? [],
      url,
      runwayUri: null,
      source: "asset_library",
    });
  }

  for (const reference of recipeReferences) {
    if (
      !reference.mediaAssetId ||
      !generatedReferenceStatuses.has(reference.status)
    ) {
      continue;
    }

    const mediaAsset = await getMediaAssetById(supabase, reference.mediaAssetId);
    const url = mediaAsset
      ? await trySignMediaAsset(supabase, mediaAsset.storageBucket, mediaAsset.storagePath)
      : null;

    references.push({
      canonicalName: reference.canonicalName,
      role: reference.type,
      description: reference.prompt ?? reference.canonicalName,
      tags: [],
      url,
      runwayUri: reference.runwayUri ?? null,
      source: "recipe_reference",
    });
  }

  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const videoSegments: AvailableAssetsManifest["videoSegments"] = [];

  for (const segment of segments) {
    if (!segment.selectedGenerationId) {
      continue;
    }

    const { data: generation, error } = await supabase
      .from("generations")
      .select("*")
      .eq("id", segment.selectedGenerationId)
      .maybeSingle();

    if (error || !generation || generation.status !== "succeeded") {
      continue;
    }

    if (!generation.media_asset_id) {
      continue;
    }

    const mediaAsset = await getMediaAssetById(supabase, generation.media_asset_id);
    const url = mediaAsset
      ? await trySignMediaAsset(supabase, mediaAsset.storageBucket, mediaAsset.storagePath)
      : null;

    videoSegments.push({
      title: segment.title,
      description: truncate(segment.description || segment.promptInitial, 500),
      durationSeconds: generation.duration_seconds ?? segment.durationTarget,
      url,
      mediaAssetId: generation.media_asset_id,
      previousSegmentTitle: findPreviousSegmentTitle(segment.position, segments),
    });
  }

  // Include succeeded generations even when the segment is no longer selected.
  const segmentIds = segments.map((segment) => segment.id);
  if (segmentIds.length > 0) {
    const { data: generations } = await supabase
      .from("generations")
      .select("*")
      .in("segment_id", segmentIds)
      .eq("status", "succeeded")
      .not("media_asset_id", "is", null);

    for (const generation of generations ?? []) {
      if (
        videoSegments.some(
          (entry) => entry.mediaAssetId === generation.media_asset_id,
        )
      ) {
        continue;
      }

      const segment = segmentById.get(generation.segment_id);
      if (!segment) {
        continue;
      }

      const mediaAsset = generation.media_asset_id
        ? await getMediaAssetById(supabase, generation.media_asset_id)
        : null;
      const url =
        mediaAsset &&
        (await trySignMediaAsset(
          supabase,
          mediaAsset.storageBucket,
          mediaAsset.storagePath,
        ));

      videoSegments.push({
        title: segment.title,
        description: truncate(segment.description || segment.promptInitial, 500),
        durationSeconds: generation.duration_seconds ?? segment.durationTarget,
        url: url ?? null,
        mediaAssetId: generation.media_asset_id,
        previousSegmentTitle: findPreviousSegmentTitle(segment.position, segments),
      });
    }
  }

  return {
    schema: "available_assets_v1",
    generatedAt: new Date().toISOString(),
    videoId: input.videoId,
    fromConversationId: input.fromConversationId ?? null,
    references,
    videoSegments,
  };
}

export async function commitAvailableAssetsManifest(input: {
  videoId: string;
  branch: string;
  manifest: AvailableAssetsManifest;
  commitMessage?: string;
  fromBranch?: string;
}) {
  const target = resolveAgentWorkspaceTarget();
  await ensureGithubBranchExists({
    owner: target.owner,
    repo: target.repo,
    branch: input.branch,
    fromBranch: input.fromBranch ?? target.branch,
    token: target.token,
  });
  const path = buildAvailableAssetsManifestPath(input.videoId);

  return pushFileToAgentWorkspace({
    target: { ...target, branch: input.branch },
    path,
    content: `${JSON.stringify(input.manifest, null, 2)}\n`,
    commitMessage:
      input.commitMessage ??
      `Recipe2Video: add available-assets manifest for ${input.videoId}`,
  });
}

async function trySignMediaAsset(
  supabase: SupabaseDataClient,
  bucket: string | null | undefined,
  path: string | null | undefined,
) {
  if (!bucket || !path) {
    return null;
  }

  return tryCreateStorageSignedUrl(supabase, {
    bucket: bucket as MediaStorageBucket,
    path,
    expiresInSeconds: MANIFEST_SIGNED_URL_TTL_SECONDS,
  });
}

function findPreviousSegmentTitle(
  position: number,
  segments: Array<{ position: number; title: string }>,
) {
  const previous = segments
    .filter((segment) => segment.position < position)
    .sort((a, b) => b.position - a.position)[0];
  return previous?.title ?? null;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}
