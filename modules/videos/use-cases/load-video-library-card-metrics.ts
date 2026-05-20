import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import { sumRunwayCreditsByVideoIds } from "@/modules/costs/repositories/cost.repository";
import { countActiveGenerationsBySegmentIds } from "@/modules/generation/repositories/generation.repository";
import { listSegmentProgressByVideoIds } from "@/modules/storyboard/repositories/segment.repository";

import { computeNextAction } from "../compute-next-action";
import type { VideoProject } from "../video.types";
import type {
  VideoLibraryCardMetrics,
  VideoLibraryCardMetricsByVideoId,
} from "../video-library-card-metrics.types";

const DEFAULT_OWNER_NAME = "Licorn Ops";

export async function loadVideoLibraryCardMetrics(
  supabase: SupabaseDataClient,
  projects: VideoProject[],
): Promise<VideoLibraryCardMetricsByVideoId> {
  const metrics = new Map<string, VideoLibraryCardMetrics>();
  if (projects.length === 0) {
    return metrics;
  }

  const videoIds = projects.map((project) => project.id);
  const [segmentRows, runwayCreditsByVideoId, ownerNameByUserId] =
    await Promise.all([
      listSegmentProgressByVideoIds(supabase, videoIds),
      sumRunwayCreditsByVideoIds(supabase, videoIds),
      loadOwnerNamesByUserId(supabase, projects),
    ]);

  const segmentsByVideoId = groupSegmentsByVideoId(segmentRows);
  const segmentIds = segmentRows.map((row) => row.id);
  const activeGenerationsBySegmentId = await countActiveGenerationsBySegmentIds(
    supabase,
    segmentIds,
  );

  for (const project of projects) {
    const segments = segmentsByVideoId.get(project.id) ?? [];
    const acceptedSegments = segments.filter(
      (segment) => segment.status === "accepted",
    ).length;
    const totalSegments = segments.length;
    const activeTaskCount = segments.reduce(
      (total, segment) =>
        total + (activeGenerationsBySegmentId.get(segment.id) ?? 0),
      0,
    );
    const totalCostCredits =
      runwayCreditsByVideoId.get(project.id) ?? project.totalCostCredits;
    const nextAction = computeNextAction({
      project,
      acceptedCount: acceptedSegments,
      totalCount: totalSegments,
    }).cta;

    metrics.set(project.id, {
      acceptedSegments,
      totalSegments,
      activeTaskCount,
      totalCostCredits,
      ownerName:
        (project.createdBy
          ? ownerNameByUserId.get(project.createdBy)
          : undefined) ?? DEFAULT_OWNER_NAME,
      nextAction,
    });
  }

  return metrics;
}

function groupSegmentsByVideoId(
  rows: Awaited<ReturnType<typeof listSegmentProgressByVideoIds>>,
) {
  const byVideoId = new Map<
    string,
    Awaited<ReturnType<typeof listSegmentProgressByVideoIds>>
  >();

  for (const row of rows) {
    const current = byVideoId.get(row.videoId) ?? [];
    current.push(row);
    byVideoId.set(row.videoId, current);
  }

  return byVideoId;
}

async function loadOwnerNamesByUserId(
  supabase: SupabaseDataClient,
  projects: VideoProject[],
): Promise<Map<string, string>> {
  const userIds = [
    ...new Set(
      projects
        .map((project) => project.createdBy)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const names = new Map<string, string>();

  if (userIds.length === 0) {
    return names;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", userIds);

  if (error) {
    return names;
  }

  for (const row of data ?? []) {
    names.set(row.id, formatOwnerNameFromEmail(row.email));
  }

  return names;
}

function formatOwnerNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? email;
  if (!localPart) {
    return DEFAULT_OWNER_NAME;
  }

  const words = localPart
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return DEFAULT_OWNER_NAME;
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
