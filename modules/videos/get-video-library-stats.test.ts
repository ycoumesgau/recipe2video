import assert from "node:assert/strict";
import test from "node:test";

import { getVideoDashboardData } from "./get-video-dashboard-data";
import type { VideoProject } from "./video.types";

test("getVideoDashboardData uses libraryStats for KPIs when provided", () => {
  const pageProject = {
    id: "page-only",
    title: "On this page",
    slug: "page-only",
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
    agentStatus: "idle",
  } as VideoProject;

  const data = getVideoDashboardData([pageProject], new Map(), {
    libraryStats: {
      total: 24,
      activeVideos: 20,
      projectsWaitingForReview: 5,
      videosCompleted: 4,
    },
    pagination: { page: 2, pageSize: 12, totalProjects: 24 },
  });

  const activeKpi = data.kpis.find((kpi) => kpi.label === "Active videos");
  const reviewKpi = data.kpis.find(
    (kpi) => kpi.label === "Projects waiting for review",
  );
  const completedKpi = data.kpis.find((kpi) => kpi.label === "Videos completed");

  assert.equal(activeKpi?.value, "20");
  assert.equal(reviewKpi?.value, "5");
  assert.equal(completedKpi?.value, "4");
  assert.equal(data.pagination.totalPages, 2);
  assert.equal(data.pagination.page, 2);
});
