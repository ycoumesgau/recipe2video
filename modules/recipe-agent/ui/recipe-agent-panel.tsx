"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquareText,
  Sparkles,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { VideoProject } from "@/modules/videos/video.types";

import {
  createRecipeAgentAction,
  submitRecipeAgentMessageAction,
  type RecipeAgentActionState,
} from "../actions";
import type {
  AgentArtifact,
  AgentRun,
  AgentRunTimelineEvent,
  RecipeAgentStage,
  RecipeAgentStatus,
} from "../recipe-agent.types";

import { AgentRunTimeline } from "./agent-run-timeline";

const initialState: RecipeAgentActionState = {};

const stageLabels: Record<RecipeAgentStage, string> = {
  recipe_ingest: "Analyze recipe",
  storyboard_revision: "Revise storyboard",
  seedance_segmentation: "Generate Seedance segments + refs",
  reference_planning: "Plan references",
  segment_prompt_revision: "Revise segment prompt",
  suno_prompt_revision: "Revise Suno prompt",
  general: "General recipe decision",
};

const statusVariant: Record<
  RecipeAgentStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  idle: "secondary",
  running: "default",
  needs_sync: "outline",
  validation_failed: "destructive",
  failed: "destructive",
  needs_input: "outline",
};

export function RecipeAgentPanel({
  artifacts,
  project,
  runs,
  latestRunTimelineEvents,
}: {
  artifacts: AgentArtifact[];
  project: VideoProject;
  runs: AgentRun[];
  latestRunTimelineEvents: AgentRunTimelineEvent[];
}) {
  const [messageState, messageAction] = useActionState(
    submitRecipeAgentMessageAction,
    initialState,
  );
  const [createState, createAction] = useActionState(
    createRecipeAgentAction,
    initialState,
  );
  const invalidArtifacts = artifacts.filter(
    (artifact) => artifact.validationStatus === "invalid",
  );
  const latestRun = runs[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Recipe Agent
            </CardTitle>
            <CardDescription>
              Persistent Cursor agent for this recipe. Messages update planning
              artifacts only; Runway generation remains gated by checkpoints.
            </CardDescription>
          </div>
          <Badge variant={statusVariant[project.agentStatus]}>
            {formatAgentStatus(project.agentStatus)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Metric label="Agent ID" value={project.cursorAgentId ?? "Not created"} />
          <Metric label="Workspace" value={project.agentWorkspacePath ?? "-"} />
          <Metric
            label="Last sync"
            value={
              project.lastAgentSyncAt
                ? formatDate(project.lastAgentSyncAt)
                : "No sync yet"
            }
          />
          <Metric
            label="Git branch"
            value={project.agentGitBranch ?? "—"}
          />
          <Metric
            label="Checkpoint SHA"
            value={
              project.agentGitCommitSha
                ? project.agentGitCommitSha.slice(0, 7)
                : "—"
            }
          />
        </div>

        <AgentRunTimeline
          agentStatus={project.agentStatus}
          initialEvents={latestRunTimelineEvents}
          latestRunId={latestRun?.id ?? null}
          videoId={project.id}
        />

        {project.agentStatus === "needs_input" ? (
          <Alert>
            <MessageSquareText className="h-4 w-4" />
            <AlertTitle>Agent is waiting for your reply</AlertTitle>
            <AlertDescription>
              Cursor emitted a request during the last run. Send a follow-up message
              below so the agent can continue.
            </AlertDescription>
          </Alert>
        ) : null}

        {invalidArtifacts.length > 0 ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Agent artifacts need correction</AlertTitle>
            <AlertDescription>
              {invalidArtifacts.length} artifact
              {invalidArtifacts.length === 1 ? "" : "s"} failed validation. Ask
              the same agent to repair the JSON before approving downstream
              checkpoints.
            </AlertDescription>
          </Alert>
        ) : null}

        {!project.cursorAgentId ? (
          <form action={createAction}>
            <input name="videoId" type="hidden" value={project.id} />
            <PendingButton icon={<Sparkles className="h-4 w-4" />}>
              Create recipe agent
            </PendingButton>
          </form>
        ) : null}

        <form action={messageAction} className="space-y-3">
          <input name="videoId" type="hidden" value={project.id} />
          <div className="grid gap-3 md:grid-cols-[220px_1fr]">
            <Select defaultValue="general" name="stage">
              <SelectTrigger aria-label="Recipe agent stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(stageLabels).map(([stage, label]) => (
                  <SelectItem key={stage} value={stage}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              name="message"
              placeholder="Example: Change the opening so the caramel crack is the first payoff, then update logical scenes and Seedance segments without launching generation."
              rows={4}
            />
          </div>
          <PendingButton icon={<MessageSquareText className="h-4 w-4" />}>
            Send to recipe agent
          </PendingButton>
        </form>

        <ActionMessage state={createState} title="Agent setup" />
        <ActionMessage state={messageState} title="Recipe agent" />

        <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
          <RunHistoryCard latestRun={latestRun} runs={runs} />
          <ArtifactSummaryCard artifacts={artifacts} />
        </div>
      </CardContent>
    </Card>
  );
}

function RunHistoryCard({
  latestRun,
  runs,
}: {
  latestRun?: AgentRun;
  runs: AgentRun[];
}) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="flex items-center gap-2 font-medium">
        <Clock3 className="h-4 w-4" />
        Agent run history
      </h3>
      {runs.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No agent runs have been recorded for this project yet.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {latestRun ? (
            <p className="text-sm text-muted-foreground">
              Latest: {stageLabels[latestRun.stage]} · {latestRun.status} ·{" "}
              {formatDate(latestRun.createdAt)}
            </p>
          ) : null}
          {runs.slice(0, 4).map((run) => (
            <div className="rounded-md border bg-muted/20 p-3 text-sm" key={run.id}>
              <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={run.status === "error" ? "destructive" : "outline"}>
                    {run.status}
                  </Badge>
                  {run.needsUserInput ? (
                    <Badge variant="secondary">needs input</Badge>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(run.createdAt)}
                </span>
              </div>
              <p className="font-medium">{stageLabels[run.stage]}</p>
              <p className="mt-1 line-clamp-2 text-muted-foreground">
                {run.userMessage}
              </p>
              {run.agentGitCommitSha ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Checkpoint {run.agentGitCommitSha.slice(0, 7)}
                  {run.agentGitBranch ? ` · ${run.agentGitBranch}` : ""}
                </p>
              ) : null}
              {run.error ? (
                <p className="mt-2 text-destructive">{run.error}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactSummaryCard({ artifacts }: { artifacts: AgentArtifact[] }) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-medium">Synced artifacts</h3>
      {artifacts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          The agent has not produced synchronized artifacts yet.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {artifacts.map((artifact) => (
            <div
              className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-2 text-sm"
              key={artifact.id}
            >
              <span className="min-w-0 truncate">{artifact.artifactName}</span>
              <Badge
                variant={
                  artifact.validationStatus === "invalid"
                    ? "destructive"
                    : artifact.validationStatus === "valid"
                      ? "default"
                      : "outline"
                }
              >
                {artifact.validationStatus}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}

function PendingButton({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </Button>
  );
}

function ActionMessage({
  state,
  title,
}: {
  state: RecipeAgentActionState;
  title: string;
}) {
  if (!state.message) {
    return null;
  }

  return (
    <Alert variant={state.kind === "error" ? "destructive" : "default"}>
      {state.kind === "success" ? <CheckCircle2 className="h-4 w-4" /> : null}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

function formatAgentStatus(status: RecipeAgentStatus) {
  return status.replace(/_/g, " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
