"use client";

import type { ReactNode } from "react";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock3,
  GitBranch,
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
import { AgentMessageAttachmentField } from "./agent-message-attachment-field";
import type { VideoProject } from "@/modules/videos/video.types";

import {
  createRecipeAgentAction,
  submitRecipeAgentMessageAction,
  syncRecipeAgentArtifactsFromGithubAction,
  type RecipeAgentActionState,
} from "../actions";
import type {
  AgentArtifact,
  AgentConversation,
  AgentRun,
  AgentRunTimelineEvent,
  RecipeAgentArtifactValidationStatus,
  RecipeAgentChatMessage,
  RecipeAgentRunStatus,
  RecipeAgentStage,
  RecipeAgentStatus,
  RecipeAgentStep,
} from "../recipe-agent.types";

import { RecipeAgentChat } from "./recipe-agent-chat";
import { RecipeAgentConversationToolbar } from "./recipe-agent-conversation-toolbar";

/** Client refresh + short polling: Inngest updates DB after `revalidatePath`, and RSC needs `router.refresh()`. */
const AGENT_CREATE_SYNC_MS = 60_000;
const AGENT_MESSAGE_SYNC_MS = 45_000;
const AGENT_SYNC_POLL_MS = 2_500;

const initialState: RecipeAgentActionState = {};

const stageLabels: Record<RecipeAgentStage, string> = {
  recipe_ingest: "Analyze recipe",
  storyboard_revision: "Revise storyboard",
  seedance_segmentation: "Generate Seedance segments + refs",
  reference_planning: "Plan references",
  segment_prompt_revision: "Revise segment prompt",
  suno_prompt_revision: "Revise Suno prompt",
  publication_planning: "Plan Spotify publication assets",
  general: "General recipe decision",
};

const statusVariant: Record<
  RecipeAgentStatus,
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info"
> = {
  idle: "secondary",
  running: "info",
  needs_sync: "warning",
  validation_failed: "destructive",
  failed: "destructive",
  needs_input: "outline",
};

const artifactValidationVariant: Record<
  RecipeAgentArtifactValidationStatus,
  "destructive" | "outline" | "success" | "warning"
> = {
  pending: "warning",
  valid: "success",
  invalid: "destructive",
};

const runStatusBadgeVariant: Record<
  RecipeAgentRunStatus,
  "destructive" | "info" | "outline" | "secondary" | "success" | "warning"
> = {
  queued: "outline",
  starting: "outline",
  running: "info",
  finalizing: "warning",
  finished: "success",
  error: "destructive",
  cancelled: "secondary",
  timed_out: "destructive",
};

export function RecipeAgentPanel({
  artifacts,
  project,
  runs,
  latestRunTimelineEvents,
  chatMessages,
  latestRunSteps,
  conversations,
  activeConversationId,
  activeConversation,
  serverActiveConversationId,
}: {
  artifacts: AgentArtifact[];
  project: VideoProject;
  runs: AgentRun[];
  latestRunTimelineEvents: AgentRunTimelineEvent[];
  chatMessages: RecipeAgentChatMessage[];
  latestRunSteps: RecipeAgentStep[];
  conversations: AgentConversation[];
  activeConversationId: string;
  activeConversation: AgentConversation;
  serverActiveConversationId: string | null;
}) {
  const router = useRouter();
  const [queuedSyncKind, setQueuedSyncKind] = useState<
    "create" | "message" | null
  >(null);

  const [messageState, messageAction] = useActionState(
    submitRecipeAgentMessageAction,
    initialState,
  );
  const [createState, createAction] = useActionState(
    createRecipeAgentAction,
    initialState,
  );

  const createSuccessHandled = useRef(false);
  const messageSuccessHandled = useRef(false);

  useEffect(() => {
    if (createState.kind !== "success") {
      createSuccessHandled.current = false;
      return;
    }
    if (createSuccessHandled.current) {
      return;
    }
    createSuccessHandled.current = true;
    setQueuedSyncKind((previous) => previous ?? "create");
    startTransition(() => {
      router.refresh();
    });
  }, [createState.kind, createState.message, router]);

  useEffect(() => {
    if (messageState.kind !== "success") {
      messageSuccessHandled.current = false;
      return;
    }
    if (messageSuccessHandled.current) {
      return;
    }
    messageSuccessHandled.current = true;
    setQueuedSyncKind((previous) => previous ?? "message");
    startTransition(() => {
      router.refresh();
    });
  }, [messageState.kind, messageState.message, router]);

  const agentStatus = activeConversation.isActive
    ? project.agentStatus
    : activeConversation.agentStatus;
  const cursorAgentId = activeConversation.cursorAgentId ?? project.cursorAgentId;

  useEffect(() => {
    if (queuedSyncKind === null) {
      return;
    }

    const satisfied =
      (queuedSyncKind === "create" && Boolean(cursorAgentId)) ||
      (queuedSyncKind === "message" && agentStatus === "running");

    if (satisfied) {
      queueMicrotask(() => {
        setQueuedSyncKind(null);
      });
      return;
    }

    const maxMs =
      queuedSyncKind === "create"
        ? AGENT_CREATE_SYNC_MS
        : AGENT_MESSAGE_SYNC_MS;
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
        queueMicrotask(() => {
          setQueuedSyncKind(null);
        });
      }
    }, AGENT_SYNC_POLL_MS);

    return () => {
      if (idRef.current !== null) {
        clearInterval(idRef.current);
      }
    };
  }, [queuedSyncKind, agentStatus, cursorAgentId, router]);

  const invalidArtifacts = artifacts.filter(
    (artifact) => artifact.validationStatus === "invalid",
  );
  const latestRun = runs[0];

  return (
    <Card id="recipe-agent">
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
          <Badge variant={statusVariant[agentStatus]}>
            {formatAgentStatus(agentStatus)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <RecipeAgentConversationToolbar
          conversations={conversations}
          serverActiveConversationId={serverActiveConversationId}
          videoId={project.id}
        />

        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Metric label="Agent ID" value={cursorAgentId ?? "Not created"} />
          <Metric
            label="Workspace"
            value={activeConversation.agentWorkspacePath ?? project.agentWorkspacePath ?? "-"}
          />
          <Metric
            label="Last sync"
            value={
              activeConversation.lastAgentSyncAt ?? project.lastAgentSyncAt
                ? formatDate(
                    activeConversation.lastAgentSyncAt ??
                      project.lastAgentSyncAt ??
                      "",
                  )
                : "No sync yet"
            }
          />
          <Metric
            label="Git branch"
            value={activeConversation.agentGitBranch ?? project.agentGitBranch ?? "—"}
          />
          <Metric
            label="Checkpoint SHA"
            value={
              activeConversation.agentGitCommitSha ?? project.agentGitCommitSha
                ? (activeConversation.agentGitCommitSha ?? project.agentGitCommitSha)!.slice(
                    0,
                    7,
                  )
                : "—"
            }
          />
        </div>

        <RecipeAgentChat
          agentStatus={agentStatus}
          initialMessages={chatMessages}
          initialSteps={latestRunSteps}
          latestRunId={latestRun?.id ?? null}
          rawTimelineEvents={latestRunTimelineEvents}
          videoId={project.id}
        />

        {agentStatus === "needs_input" ? (
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

        {!cursorAgentId ? (
          <form action={createAction}>
            <input name="videoId" type="hidden" value={project.id} />
            <input name="conversationId" type="hidden" value={activeConversationId} />
            <PendingButton icon={<Sparkles className="h-4 w-4" />}>
              Create recipe agent
            </PendingButton>
          </form>
        ) : null}

        <form action={messageAction} className="space-y-3" encType="multipart/form-data">
          <input name="videoId" type="hidden" value={project.id} />
          <input name="conversationId" type="hidden" value={activeConversationId} />
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
            <AgentMessageAttachmentField
              fileInputName="agentAttachments"
              label="Message"
              placeholder="Example: Change the opening so the caramel crack is the first payoff, then update logical scenes and Seedance segments without launching generation."
              textareaId="recipe-agent-message"
              textareaName="message"
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
          <ArtifactSummaryCard
            activeConversation={activeConversation}
            artifacts={artifacts}
            project={project}
          />
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
                  <Badge variant={runStatusBadgeVariant[run.status]}>
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

function ArtifactSummaryCard({
  artifacts,
  project,
  activeConversation,
}: {
  artifacts: AgentArtifact[];
  project: VideoProject;
  activeConversation: AgentConversation;
}) {
  const router = useRouter();
  const [gitSyncState, gitSyncAction] = useActionState(
    syncRecipeAgentArtifactsFromGithubAction,
    initialState,
  );
  const gitSyncSuccessHandled = useRef(false);

  useEffect(() => {
    if (gitSyncState.kind !== "success") {
      gitSyncSuccessHandled.current = false;
      return;
    }
    if (gitSyncSuccessHandled.current) {
      return;
    }
    gitSyncSuccessHandled.current = true;
    startTransition(() => {
      router.refresh();
    });
  }, [gitSyncState.kind, gitSyncState.message, router]);

  const canSyncFromGit = Boolean(
    (activeConversation.agentWorkspacePath ?? project.agentWorkspacePath)?.trim() &&
      ((activeConversation.agentGitBranch ?? project.agentGitBranch)?.trim() ||
        (activeConversation.agentGitCommitSha ?? project.agentGitCommitSha)?.trim()),
  );

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
              <Badge variant={artifactValidationVariant[artifact.validationStatus]}>
                {artifact.validationStatus}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <form action={gitSyncAction} className="mt-4 space-y-2 border-t pt-4">
        <input name="videoId" type="hidden" value={project.id} />
        <p className="text-xs text-muted-foreground">
          Pull JSON and markdown from the Git workspace ({canSyncFromGit ? "branch / SHA on file" : "—"}).
          No Cursor run; uses server GitHub config.
        </p>
        <GitSyncSubmitButton disabled={!canSyncFromGit} />
      </form>
      <ActionMessage state={gitSyncState} title="Git artifact sync" />
    </div>
  );
}

function GitSyncSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      className="w-full gap-2"
      disabled={disabled || pending}
      type="submit"
      variant="secondary"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        <GitBranch className="h-4 w-4 shrink-0" />
      )}
      Sync from Git only
    </Button>
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
