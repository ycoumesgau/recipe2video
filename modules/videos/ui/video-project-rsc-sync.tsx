"use client";

import { startTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import type { RecipeAgentStatus } from "@/modules/recipe-agent/recipe-agent.types";
import type { VideoStatus } from "@/modules/videos/video-status";

const POLL_MS = 2_500;
const NEW_PROJECT_MAX_MS = 120_000;
const AGENT_RUNNING_MAX_MS = 300_000;

export interface VideoProjectRscSyncProps {
  agentPlanningRequested: boolean;
  agentRunCount: number;
  agentStatus: RecipeAgentStatus;
  cursorAgentId: string | null;
  projectStatus: VideoStatus;
}

/**
 * Re-fetches the current route’s RSC payload while Supabase/Inngest catches up.
 * Covers the “nouvelle vidéo” redirect where the first paint predates the agent run.
 */
export function VideoProjectRscSync({
  agentPlanningRequested,
  agentRunCount,
  agentStatus,
  cursorAgentId,
  projectStatus,
}: VideoProjectRscSyncProps) {
  const router = useRouter();

  const shouldSync = useMemo(() => {
    const wizardBootstrap =
      agentPlanningRequested &&
      projectStatus === "draft" &&
      agentRunCount === 0 &&
      !cursorAgentId &&
      agentStatus === "idle";
    const midRun = agentStatus === "running";
    return wizardBootstrap || midRun;
  }, [
    agentPlanningRequested,
    agentRunCount,
    agentStatus,
    cursorAgentId,
    projectStatus,
  ]);

  useEffect(() => {
    if (!shouldSync) {
      return;
    }

    startTransition(() => {
      router.refresh();
    });

    const maxMs =
      agentStatus === "running" ? AGENT_RUNNING_MAX_MS : NEW_PROJECT_MAX_MS;
    const startedAt = Date.now();

    const idRef: { current: ReturnType<typeof setInterval> | null } = {
      current: null,
    };
    idRef.current = setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
      if (Date.now() - startedAt >= maxMs) {
        if (idRef.current !== null) {
          clearInterval(idRef.current);
          idRef.current = null;
        }
      }
    }, POLL_MS);

    return () => {
      if (idRef.current !== null) {
        clearInterval(idRef.current);
      }
    };
  }, [agentStatus, router, shouldSync]);

  return null;
}
