import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { listVideoProjects } from "@/modules/videos/repositories/video.repository";

import { SEEDED_COST_LOGS, SEEDED_COST_PROJECTS } from "./cost.fixtures";
import { getCostDashboardData } from "./get-cost-dashboard-data";
import {
  listCostLogs,
  listCostLogsByVideoId,
} from "./repositories/cost.repository";
import { fetchRunwayOrganizationBalance } from "./runway-organization-balance";
import type { CostDashboardProjectRef, CostLog } from "./cost.types";

export type LoadCostDashboardOptions = {
  useMockFallback?: boolean;
};

export async function loadGlobalCostDashboardData(
  options: LoadCostDashboardOptions = {},
) {
  const useMockFallback = options.useMockFallback ?? false;
  const runwayBalance = await fetchRunwayOrganizationBalance();

  try {
    const supabase = createSupabaseAdminClient();
    const [logs, projects] = await Promise.all([
      listCostLogs(supabase, { limit: 500 }),
      listVideoProjects(supabase, { limit: 50, archiveFilter: "all" }),
    ]);

    return getCostDashboardData({
      logs:
        logs.length > 0 ? logs : useMockFallback ? SEEDED_COST_LOGS : [],
      projects:
        projects.length > 0
          ? projects
          : useMockFallback
            ? SEEDED_COST_PROJECTS
            : [],
      scope: "global",
      runwayBalance,
    });
  } catch {
    return getCostDashboardData({
      logs: useMockFallback ? SEEDED_COST_LOGS : [],
      projects: useMockFallback ? SEEDED_COST_PROJECTS : [],
      scope: "global",
      runwayBalance,
    });
  }
}

export async function loadProjectCostDashboardData(
  videoId: string,
  options: LoadCostDashboardOptions = {},
) {
  const useMockFallback = options.useMockFallback ?? false;
  const runwayBalance = await fetchRunwayOrganizationBalance();

  try {
    const supabase = createSupabaseAdminClient();
    const [projectLogs, globalLogs, projects] = await Promise.all([
      listCostLogsByVideoId(supabase, videoId),
      listCostLogs(supabase, { limit: 500 }),
      listVideoProjects(supabase, { limit: 50, archiveFilter: "all" }),
    ]);
    const project = projects.find((item) => item.id === videoId);
    const displayLogs =
      projectLogs.length > 0
        ? projectLogs
        : useMockFallback
          ? seededLogsForVideo(videoId)
          : [];
    const budgetLogs =
      globalLogs.length > 0
        ? globalLogs
        : useMockFallback
          ? SEEDED_COST_LOGS
          : [];
    const projectRefs =
      projects.length > 0
        ? projects
        : useMockFallback
          ? SEEDED_COST_PROJECTS
          : [];

    return getCostDashboardData({
      logs: displayLogs,
      globalLogs: budgetLogs,
      projects: projectRefs,
      scope: "project",
      projectId: videoId,
      projectTitle: project?.title ?? seededProjectTitle(videoId),
      runwayBalance,
    });
  } catch {
    return getCostDashboardData({
      logs: useMockFallback ? seededLogsForVideo(videoId) : [],
      globalLogs: useMockFallback ? SEEDED_COST_LOGS : [],
      projects: useMockFallback ? SEEDED_COST_PROJECTS : [],
      scope: "project",
      projectId: videoId,
      projectTitle: seededProjectTitle(videoId),
      runwayBalance,
    });
  }
}

function seededLogsForVideo(videoId: string): CostLog[] {
  return SEEDED_COST_LOGS.filter((log) => log.videoId === videoId);
}

function seededProjectTitle(videoId: string) {
  return (
    (SEEDED_COST_PROJECTS as CostDashboardProjectRef[]).find(
      (project) => project.id === videoId,
    )?.title ?? "Project"
  );
}
