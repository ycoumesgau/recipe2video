"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, Mic2, Sparkles, Wand2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approveStoryboardAction,
  loadParisBrestStoryboardFixtureAction,
  requestStoryboardRevisionAction,
  type StoryboardActionState,
} from "@/modules/storyboard/actions";

const initialState: StoryboardActionState = {};

export function StoryboardActions({
  canApprove,
  canLoadFixture,
  isApproved,
  videoId,
}: {
  canApprove: boolean;
  canLoadFixture: boolean;
  isApproved: boolean;
  videoId: string;
}) {
  const [loadFixtureState, loadFixtureAction] = useActionState(
    loadParisBrestStoryboardFixtureAction,
    initialState,
  );
  const [approveState, approveAction] = useActionState(
    approveStoryboardAction,
    initialState,
  );
  const [revisionState, revisionAction] = useActionState(
    requestStoryboardRevisionAction,
    initialState,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="font-medium">Checkpoint actions</h3>
          <p className="text-sm text-muted-foreground">
            Approving only advances the storyboard checkpoint. It does not launch
            Seedance generation.
          </p>
        </div>

        {canLoadFixture ? (
          <form action={loadFixtureAction}>
            <input name="videoId" type="hidden" value={videoId} />
            <PendingButton icon="sparkles" variant="outline">
              Load Paris-Brest fixture storyboard
            </PendingButton>
          </form>
        ) : null}

        <form action={approveAction}>
          <input name="videoId" type="hidden" value={videoId} />
          <PendingButton disabled={!canApprove || isApproved} icon="check">
            {isApproved ? "Storyboard approved" : "Approve storyboard"}
          </PendingButton>
        </form>

        <Button disabled type="button" variant="secondary">
          Launch Seedance generation
        </Button>
        <p className="text-xs text-muted-foreground">
          Generation stays disabled in this issue; later workflow screens must
          still show selected model and cost before launch.
        </p>

        <ActionMessage state={loadFixtureState} title="Fixture" />
        <ActionMessage state={approveState} title="Approval" />
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="font-medium">Ask agent to revise</h3>
          <p className="text-sm text-muted-foreground">
            This sends the revision to the persistent recipe agent for this
            project and keeps generation blocked until you approve the result.
          </p>
        </div>
        <form action={revisionAction} className="space-y-3">
          <input name="videoId" type="hidden" value={videoId} />
          <Textarea
            disabled={!canApprove}
            name="revisionRequest"
            placeholder="Example: Make the opening more texture-first and reduce any scenes that could confuse the Paris-Brest crown geometry."
            rows={4}
          />
          <div className="flex flex-wrap gap-2">
            <PendingButton disabled={!canApprove} icon="wand" variant="outline">
              Request revision
            </PendingButton>
            <Button disabled type="button" variant="outline">
              <Mic2 />
              TTS pitch placeholder
            </Button>
          </div>
        </form>
        <ActionMessage state={revisionState} title="Revision" />
      </div>
    </div>
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
  icon: "check" | "sparkles" | "wand";
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  const Icon = icon === "check" ? CheckCircle2 : icon === "sparkles" ? Sparkles : Wand2;

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
  state: StoryboardActionState;
  title: string;
}) {
  if (!state.message) {
    return null;
  }

  return (
    <Alert variant={state.kind === "error" ? "destructive" : "default"}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}
