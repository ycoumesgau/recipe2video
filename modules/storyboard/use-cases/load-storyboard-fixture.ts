import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  getVideoProjectById,
  updateVideoProjectStatus,
} from "@/modules/videos/repositories/video.repository";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import { toJson } from "@/shared/supabase/json";

import {
  buildFixturePromptQa,
  getParisBrestStoryboardFixture,
} from "../paris-brest-storyboard.fixture";
import {
  listLogicalScenesByVideoId,
  replaceLogicalScenesForVideo,
  updateLogicalSceneSegmentLinks,
} from "../repositories/logical-scene.repository";
import {
  createSeedanceSegment,
  listSegmentsByVideoId,
} from "../repositories/segment.repository";
import type { LogicalScene, SeedanceSegment } from "../storyboard.types";

export interface LoadStoryboardFixtureInput {
  videoId: string;
  requestedByUserId: string;
}

export interface StoryboardReviewData {
  logicalScenes: LogicalScene[];
  seedanceSegments: SeedanceSegment[];
}

export async function getStoryboardReviewData(
  videoId: string,
): Promise<StoryboardReviewData> {
  const supabase = createSupabaseAdminClient();
  const [logicalScenes, seedanceSegments] = await Promise.all([
    listLogicalScenesByVideoId(supabase, videoId),
    listSegmentsByVideoId(supabase, videoId),
  ]);

  return { logicalScenes, seedanceSegments };
}

export async function loadParisBrestStoryboardFixture(
  input: LoadStoryboardFixtureInput,
): Promise<StoryboardReviewData> {
  const supabase = createSupabaseAdminClient();
  const project = await getVideoProjectById(supabase, input.videoId);

  if (!project) {
    throw new Error("Video project not found.");
  }

  const { error: deleteSegmentsError } = await supabase
    .from("segments")
    .delete()
    .eq("video_id", input.videoId);

  throwIfSupabaseError(
    deleteSegmentsError,
    "loadParisBrestStoryboardFixture delete segments failed",
  );

  const fixture = getParisBrestStoryboardFixture();
  const logicalScenes = await replaceLogicalScenesForVideo(
    supabase,
    input.videoId,
    fixture.logicalScenes,
  );
  const logicalSceneByPosition = new Map(
    logicalScenes.map((scene) => [scene.position, scene]),
  );
  const segmentLinks: { sceneId: string; segmentId: string }[] = [];
  const seedanceSegments: SeedanceSegment[] = [];

  for (const fixtureSegment of fixture.seedanceSegments) {
    const logicalSceneIds = fixtureSegment.logicalScenePositions
      .map((position) => logicalSceneByPosition.get(position)?.id)
      .filter((id): id is string => Boolean(id));
    const segment = await createSeedanceSegment(supabase, {
      videoId: input.videoId,
      position: fixtureSegment.position,
      title: fixtureSegment.title,
      arc: fixtureSegment.arc,
      logicalSceneIds,
      description: fixtureSegment.description,
      prompt: fixtureSegment.prompt,
      promptInitial: fixtureSegment.prompt,
      references: fixtureSegment.references,
      durationTarget: fixtureSegment.durationTarget,
      status: "ready",
      createdBy: input.requestedByUserId,
    });

    seedanceSegments.push({
      ...segment,
      qaChecklist: buildFixturePromptQa(
        fixtureSegment.prompt,
        fixtureSegment.references,
      ),
    });
    for (const sceneId of logicalSceneIds) {
      segmentLinks.push({ sceneId, segmentId: segment.id });
    }
  }

  await updateLogicalSceneSegmentLinks(supabase, segmentLinks);

  const { error: checkpointError } = await supabase
    .from("videos")
    .update({
      storyboard: toJson({
        source: "fixture:paris-brest-public-safe",
        logicalSceneCount: logicalScenes.length,
      }),
      seedance_segments: toJson({
        source: "fixture:paris-brest-public-safe",
        segmentCount: seedanceSegments.length,
      }),
    })
    .eq("id", input.videoId);

  throwIfSupabaseError(
    checkpointError,
    "loadParisBrestStoryboardFixture checkpoint failed",
  );

  await updateVideoProjectStatus(supabase, input.videoId, "storyboard_ready");

  return getStoryboardReviewData(input.videoId);
}
