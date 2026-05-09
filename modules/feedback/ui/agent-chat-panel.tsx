"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, MessageSquareText, RotateCcw, XCircle } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  applyPromptDiffAction,
  rejectPromptDiffAction,
  submitSegmentFeedbackAction,
  type SegmentFeedbackActionState,
} from "@/modules/feedback/actions";
import type { SegmentFeedback } from "@/modules/feedback/feedback.types";

import { PromptDiffViewer } from "./prompt-diff-viewer";

const initialState: SegmentFeedbackActionState = {};

export function AgentChatPanel({
  feedbacks,
  generationId,
  segmentId,
  videoId,
}: {
  feedbacks: SegmentFeedback[];
  generationId?: string | null;
  segmentId: string;
  videoId: string;
}) {
  const [submitState, submitAction] = useActionState(
    submitSegmentFeedbackAction,
    initialState,
  );
  const [applyState, applyAction] = useActionState(
    applyPromptDiffAction,
    initialState,
  );
  const [rejectState, rejectAction] = useActionState(
    rejectPromptDiffAction,
    initialState,
  );
  const proposal = submitState.proposal;
  const canSubmit = Boolean(generationId);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Agent feedback</CardTitle>
            <CardDescription>
              Give natural-language correction, then approve the prompt diff
              before regeneration.
            </CardDescription>
          </div>
          <Badge variant="outline">Diff-first</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canSubmit ? (
          <Alert>
            <AlertTitle>No generation selected</AlertTitle>
            <AlertDescription>
              Store or select a generation variant before submitting feedback.
              Feedback rows require a generation ID.
            </AlertDescription>
          </Alert>
        ) : null}

        <form action={submitAction} className="space-y-3" id="segment-feedback-form">
          <input name="videoId" type="hidden" value={videoId} />
          <input name="segmentId" type="hidden" value={segmentId} />
          <input name="generationId" type="hidden" value={generationId ?? ""} />
          <Textarea
            aria-label="Segment feedback"
            disabled={!canSubmit}
            name="feedbackMessage"
            placeholder="Example: The caramel should crack into brittle shards instead of bending like soft syrup."
            rows={5}
          />
          <PendingButton disabled={!canSubmit} icon="message">
            Generate prompt diff
          </PendingButton>
        </form>

        <ActionMessage state={submitState} title="Agent" />
        <ActionMessage state={applyState} title="Apply" />
        <ActionMessage state={rejectState} title="Reject" />

        {proposal ? (
          <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
            <div>
              <h3 className="font-medium">Diff proposal</h3>
              <p className="text-sm text-muted-foreground">
                Review the exact prompt change before spending Runway credits.
                The selected model is shown in the prompt panel.
              </p>
            </div>
            <PromptDiffViewer diff={proposal.diff} />
            <div className="grid gap-3 md:grid-cols-2">
              <PromptBlock label="Before" value={proposal.promptBefore} />
              <PromptBlock label="After" value={proposal.promptAfter} />
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={applyAction}>
                <input name="videoId" type="hidden" value={videoId} />
                <input name="segmentId" type="hidden" value={segmentId} />
                <input name="feedbackId" type="hidden" value={proposal.feedbackId} />
                <PendingButton icon="apply">
                  Apply and regenerate
                </PendingButton>
              </form>
              <form action={rejectAction}>
                <input name="videoId" type="hidden" value={videoId} />
                <input name="segmentId" type="hidden" value={segmentId} />
                <input name="feedbackId" type="hidden" value={proposal.feedbackId} />
                <PendingButton icon="reject" variant="outline">
                  Cancel
                </PendingButton>
              </form>
              <Button
                disabled={!canSubmit}
                form="segment-feedback-form"
                type="submit"
                variant="outline"
              >
                <MessageSquareText />
                Ask for another edit
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <h3 className="font-medium">Feedback history</h3>
          {feedbacks.length === 0 ? (
            <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              No feedback has been stored for this segment yet.
            </p>
          ) : (
            feedbacks.map((feedback) => (
              <div className="rounded-lg border p-3 text-sm" key={feedback.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Badge variant={feedback.applied ? "default" : "outline"}>
                    {feedback.applied ? "Applied" : "Not applied"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(feedback.createdAt)}
                  </span>
                </div>
                <p className="text-muted-foreground">{feedback.message}</p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PendingButton({
  children,
  disabled,
  icon,
  variant,
}: {
  children: ReactNode;
  disabled?: boolean;
  icon: "message" | "apply" | "reject";
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  const Icon =
    icon === "message"
      ? MessageSquareText
      : icon === "apply"
        ? RotateCcw
        : XCircle;

  return (
    <Button disabled={disabled || pending} type="submit" variant={variant}>
      {pending ? <Loader2 className="animate-spin" /> : <Icon />}
      {children}
    </Button>
  );
}

function ActionMessage({
  state,
  title,
}: {
  state: SegmentFeedbackActionState;
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

function PromptBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
        {value}
      </p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
