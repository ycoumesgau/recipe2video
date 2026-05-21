import type { VideoProject } from "./video.types";

export type ProjectNextAction = {
  detail: string;
  cta: string;
  href: string | null;
};

export function computeNextAction(input: {
  project: VideoProject;
  acceptedCount: number;
  totalCount: number;
}): ProjectNextAction {
  const { project } = input;

  if (project.agentStatus === "needs_input") {
    return {
      detail:
        "The recipe agent asked for clarification in Cursor. Reply via Recipe Agent below, then refresh when the follow-up run completes.",
      cta: "Answer agent request",
      href: `/videos/${project.id}`,
    };
  }

  if (project.agentStatus === "validation_failed") {
    return {
      detail:
        "The recipe agent produced artifacts that failed validation. Ask the same agent to repair them before approving downstream checkpoints.",
      cta: "Open Recipe Agent",
      href: `/videos/${project.id}`,
    };
  }

  if (project.agentStatus === "running") {
    return {
      detail:
        "The recipe agent is currently updating planning artifacts. Refresh this project after the run completes.",
      cta: "Agent running",
      href: null,
    };
  }

  if (project.status === "draft") {
    return {
      detail: "Recipe ingest is queued through Inngest.",
      cta: "Awaiting recipe ingest",
      href: null,
    };
  }
  if (project.status === "clarification_needed") {
    return {
      detail: "Answer the clarifying questions before generating the storyboard.",
      cta: "Open storyboard",
      href: `/videos/${project.id}/storyboard`,
    };
  }
  if (project.status === "recipe_ingested" || project.status === "storyboard_ready") {
    return {
      detail: "Review the proposed storyboard and approve it before any Runway spend.",
      cta: "Review storyboard",
      href: `/videos/${project.id}/storyboard`,
    };
  }
  if (project.status === "storyboard_approved") {
    return {
      detail: "Approve and upload the kitchen + recipe-state references.",
      cta: "Open references",
      href: `/videos/${project.id}/references`,
    };
  }
  if (
    project.status === "references_ready" ||
    project.status === "generating" ||
    project.status === "review"
  ) {
    return {
      detail: `Review Seedance segment variants (${input.acceptedCount}/${input.totalCount} accepted).`,
      cta: "Open segments",
      href: `/videos/${project.id}/segments`,
    };
  }
  if (project.status === "assembling") {
    return {
      detail:
        "Upload and link Suno audio on Music, then trim clips and export the master on Assembly.",
      cta: "Open assembly",
      href: `/videos/${project.id}/assembly`,
    };
  }
  if (project.status === "exported") {
    return {
      detail:
        "Final export delivered. Open Assembly for the timeline, or Music to replace the track.",
      cta: "Open assembly",
      href: `/videos/${project.id}/assembly`,
    };
  }
  return {
    detail: "A workflow step failed; inspect the logs and retry.",
    cta: "Open costs and logs",
    href: `/videos/${project.id}/costs`,
  };
}
