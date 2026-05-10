import assert from "node:assert/strict";
import test from "node:test";

import { getVideoDashboardData } from "./get-video-dashboard-data";
import type { VideoProject } from "./video.types";

test("getVideoDashboardData defaults missing agent status to idle", () => {
  const legacyProject = {
    id: "legacy-video",
    title: "Legacy video",
    slug: "legacy-video",
    recipeUrl: null,
    recipeData: null,
    status: "draft",
    storyboard: null,
    seedanceSegments: null,
    selectedVideoModel: "seedance2",
    selectedImageModel: "gpt_image_2",
    selectedTtsModel: "eleven_multilingual_v2",
    selectedSfxModel: "eleven_text_to_sound_v2",
    totalCostCredits: 0,
    totalCostOpenai: 0,
    createdBy: "user-1",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  } as VideoProject;

  const data = getVideoDashboardData([legacyProject]);
  const project = data.projects.find((item) => item.id === "legacy-video");

  assert.equal(project?.agentStatus, "idle");
  assert.equal(project?.canArchive, true);
  assert.equal(project?.archivedAt ?? null, null);
});
