import { CheckCircle2, Circle, CircleDot, AlertCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import type { VideoStatus } from "../video-status";

type StepState = "done" | "active" | "blocked" | "pending";

interface PipelineStep {
  key: string;
  label: string;
  detail: string;
  state: StepState;
}

const STATUS_RANK: Record<VideoStatus, number> = {
  draft: 0,
  recipe_ingested: 1,
  clarification_needed: 1,
  storyboard_ready: 2,
  storyboard_approved: 3,
  references_ready: 4,
  generating: 5,
  review: 5,
  assembling: 6,
  exported: 7,
  failed: -1,
};

interface ProjectPipelineProgressProps {
  status: VideoStatus;
  acceptedSegmentCount: number;
  totalSegmentCount: number;
  activeTaskCount: number;
}

/**
 * Surface the six PRD-required pipeline steps so the user always sees what is
 * done, what is in progress, and what is still ahead. The step state is
 * derived from `videos.status` (see STATUS_RANK) plus segment counts so the
 * "Segments accepted" line shows real progress instead of a binary done flag.
 */
export function ProjectPipelineProgress({
  status,
  acceptedSegmentCount,
  totalSegmentCount,
  activeTaskCount,
}: ProjectPipelineProgressProps) {
  const rank = STATUS_RANK[status] ?? 0;
  const isFailed = status === "failed";
  const isClarification = status === "clarification_needed";

  const steps: PipelineStep[] = [
    buildStep({
      key: "recipe",
      label: "Recipe ingested",
      done: rank >= 1,
      active: status === "draft",
      detail: isClarification
        ? "Clarification questions waiting"
        : status === "draft"
          ? "Awaiting OpenAI extraction"
          : "Structured recipe stored",
    }),
    buildStep({
      key: "storyboard",
      label: "Storyboard approved",
      done: rank >= 3,
      active: rank === 1 || rank === 2,
      detail:
        rank >= 3
          ? "Logical scenes + Seedance segments ready"
          : "Pending agent storyboard + user approval",
    }),
    buildStep({
      key: "references",
      label: "References ready",
      done: rank >= 4,
      active: rank === 3,
      detail:
        rank >= 4
          ? "Kitchen + recipe-state references uploaded to Runway"
          : "Approve and upload reference images",
    }),
    buildStep({
      key: "segments",
      label: "Segments accepted",
      done: totalSegmentCount > 0 && acceptedSegmentCount >= totalSegmentCount,
      active: rank === 5 || (totalSegmentCount > 0 && acceptedSegmentCount > 0),
      detail:
        totalSegmentCount > 0
          ? `${acceptedSegmentCount} of ${totalSegmentCount} accepted`
          : "Generate Seedance segments after references",
    }),
    buildStep({
      key: "assembly",
      label: "Assembly preview",
      done: rank >= 6,
      active: rank === 5 && acceptedSegmentCount > 0,
      detail:
        rank >= 6
          ? "Segments composed in Remotion"
          : "Order segments + align Suno music",
    }),
    buildStep({
      key: "export",
      label: "Final export",
      done: status === "exported",
      active: status === "assembling",
      detail:
        status === "exported"
          ? "Final MP4 stored in Supabase Storage and Mux"
          : "Render and persist the final master",
    }),
  ];

  if (isFailed) {
    for (const step of steps) {
      if (step.state === "active") {
        step.state = "blocked";
        step.detail = "A workflow step failed; resume from the next required action.";
        break;
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pipeline progress
        </h3>
        <Badge variant={activeTaskCount > 0 ? "default" : "outline"}>
          {activeTaskCount} active task{activeTaskCount === 1 ? "" : "s"}
        </Badge>
      </div>
      <ol className="space-y-2">
        {steps.map((step) => (
          <li
            key={step.key}
            className="flex items-start gap-3 rounded-lg border p-3"
          >
            <StepIcon state={step.state} />
            <div className="flex-1">
              <p className="font-medium leading-tight">{step.label}</p>
              <p className="text-sm text-muted-foreground">{step.detail}</p>
            </div>
            <StepBadge state={step.state} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function buildStep(input: {
  key: string;
  label: string;
  done: boolean;
  active: boolean;
  detail: string;
}): PipelineStep {
  let state: StepState;
  if (input.done) {
    state = "done";
  } else if (input.active) {
    state = "active";
  } else {
    state = "pending";
  }
  return {
    key: input.key,
    label: input.label,
    detail: input.detail,
    state,
  };
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />;
  }
  if (state === "active") {
    return <CircleDot className="mt-0.5 h-5 w-5 text-amber-500" />;
  }
  if (state === "blocked") {
    return <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />;
  }
  return <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />;
}

function StepBadge({ state }: { state: StepState }) {
  if (state === "done") {
    return <Badge variant="secondary">Done</Badge>;
  }
  if (state === "active") {
    return <Badge>In progress</Badge>;
  }
  if (state === "blocked") {
    return <Badge variant="destructive">Blocked</Badge>;
  }
  return <Badge variant="outline">Pending</Badge>;
}
