import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { listVideoProjects } from "@/modules/videos/repositories/video.repository";

import { SEEDED_COST_LOGS, SEEDED_COST_PROJECTS } from "./cost.fixtures";
import { getCostDashboardData } from "./get-cost-dashboard-data";
import {
  listCostLogs,
  listCostLogsByVideoId,
} from "./repositories/cost.repository";
import type { CostDashboardProjectRef, CostLog } from "./cost.types";

export async function loadGlobalCostDashboardData() {
  try {
    const supabase = createSupabaseAdminClient();
    const [logs, projects] = await Promise.all([
      listCostLogs(supabase, { limit: 500 }),
      listVideoProjects(supabase, { limit: 50 }),
    ]);

    return getCostDashboardData({
      logs: logs.length > 0 ? logs : SEEDED_COST_LOGS,
      projects: projects.length > 0 ? projects : SEEDED_COST_PROJECTS,
      scope: "global",
    });
  } catch {
    return getCostDashboardData({
      logs: SEEDED_COST_LOGS,
      projects: SEEDED_COST_PROJECTS,
      scope: "global",
    });
  }
}

export async function loadProjectCostDashboardData(videoId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const [projectLogs, globalLogs, projects] = await Promise.all([
      listCostLogsByVideoId(supabase, videoId),
      listCostLogs(supabase, { limit: 500 }),
      listVideoProjects(supabase, { limit: 50 }),
    ]);
    const project = projects.find((item) => item.id === videoId);
    const displayLogs = projectLogs.length > 0 ? projectLogs : seededLogsForVideo(videoId);
    const budgetLogs = globalLogs.length > 0 ? globalLogs : SEEDED_COST_LOGS;
    const projectRefs = projects.length > 0 ? projects : SEEDED_COST_PROJECTS;

    return getCostDashboardData({
      logs: displayLogs,
      globalLogs: budgetLogs,
      projects: projectRefs,
      scope: "project",
      projectId: videoId,
      projectTitle: project?.title ?? seededProjectTitle(videoId),
    });
  } catch {
    return getCostDashboardData({
      logs: seededLogsForVideo(videoId),
      globalLogs: SEEDED_COST_LOGS,
      projects: SEEDED_COST_PROJECTS,
      scope: "project",
      projectId: videoId,
      projectTitle: seededProjectTitle(videoId),
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
