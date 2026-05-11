"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { Activity, ChevronDown, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type {
  AgentRunTimelineEvent,
  RecipeAgentChatMessage,
  RecipeAgentStatus,
  RecipeAgentStep,
} from "../recipe-agent.types";
import { recipeAgentMessagesToThreadMessages } from "./recipe-agent-messages-to-thread";

type SnapshotPayload = {
  type: "snapshot";
  messages: RecipeAgentChatMessage[];
  steps: RecipeAgentStep[];
  runStatus: string;
};

function formatEventPreview(payload: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(payload);
    return json.length > 240 ? `${json.slice(0, 237)}…` : json;
  } catch {
    return "(payload)";
  }
}

function RecipeAgentChatThreadPanel({
  threadMessages,
  isRunning,
}: {
  threadMessages: ReturnType<typeof recipeAgentMessagesToThreadMessages>;
  isRunning: boolean;
}) {
  const onNew = useCallback(async () => {}, []);

  const store = useMemo(
    () => ({
      messages: threadMessages,
      isRunning,
      onNew,
    }),
    [threadMessages, isRunning, onNew],
  );

  const runtime = useExternalStoreRuntime(store);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-[min(420px,55vh)] min-h-0 flex-col overflow-hidden rounded-lg border bg-muted/10">
        <ThreadPrimitive.Viewport
          autoScroll
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2"
          scrollToBottomOnInitialize
          scrollToBottomOnRunStart
        >
          <ThreadPrimitive.Messages>
            {({ message }) => {
              if (message.role === "user") {
                return (
                  <MessagePrimitive.Root
                    className="flex justify-end py-2"
                    key={message.id}
                  >
                    <div className="max-w-[88%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                      <MessagePrimitive.Parts>
                        {({ part }) =>
                          part.type === "text" ? (
                            <p className="whitespace-pre-wrap" key={`${message.id}-text`}>
                              <MessagePartPrimitive.Text />
                            </p>
                          ) : null
                        }
                      </MessagePrimitive.Parts>
                    </div>
                  </MessagePrimitive.Root>
                );
              }

              return (
                <MessagePrimitive.Root
                  className="flex justify-start py-2"
                  key={message.id}
                >
                  <div className="max-w-[88%] space-y-2 rounded-2xl border bg-background px-3 py-2 text-sm shadow-sm">
                    <MessagePrimitive.Parts>
                      {({ part }) => {
                        if (part.type === "text") {
                          return (
                            <div className="whitespace-pre-wrap" key={`${message.id}-text`}>
                              <MessagePartPrimitive.Text />
                            </div>
                          );
                        }
                        if (part.type === "reasoning") {
                          const reasoningText =
                            "text" in part && typeof part.text === "string"
                              ? part.text
                              : "";
                          return (
                            <Collapsible className="rounded-md border bg-muted/30" key={`${message.id}-reason`}>
                              <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50">
                                Run summary
                                <ChevronDown className="h-3 w-3" />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="border-t px-2 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
                                {reasoningText}
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        }
                        return null;
                      }}
                    </MessagePrimitive.Parts>
                  </div>
                </MessagePrimitive.Root>
              );
            }}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

export function RecipeAgentChat({
  videoId,
  agentStatus,
  latestRunId,
  initialMessages,
  initialSteps,
  rawTimelineEvents,
}: {
  videoId: string;
  agentStatus: RecipeAgentStatus;
  latestRunId: string | null;
  initialMessages: RecipeAgentChatMessage[];
  initialSteps: RecipeAgentStep[];
  rawTimelineEvents: AgentRunTimelineEvent[];
}) {
  const [liveMessages, setLiveMessages] = useState<RecipeAgentChatMessage[] | null>(
    null,
  );
  const [liveSteps, setLiveSteps] = useState<RecipeAgentStep[] | null>(null);

  const displayMessages = liveMessages ?? initialMessages;
  const displaySteps = liveSteps ?? initialSteps;

  const threadMessages = useMemo(
    () => recipeAgentMessagesToThreadMessages(displayMessages),
    [displayMessages],
  );

  const shouldStream =
    agentStatus === "running" && Boolean(latestRunId);

  useEffect(() => {
    if (!shouldStream || !latestRunId) {
      /* Live buffer is only meaningful while the agent run is in progress; clear
         when leaving streaming so the next run does not flash the previous SSE
         snapshot. eslint: sync reset on dependency change, not an external subscription. */
      /* eslint-disable react-hooks/set-state-in-effect -- intentional buffer reset */
      setLiveMessages(null);
      setLiveSteps(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    const source = new EventSource(
      `/api/videos/${videoId}/agent-chat/stream?runId=${encodeURIComponent(latestRunId)}`,
    );

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SnapshotPayload | { type: "done" };
        if (data.type === "snapshot") {
          setLiveMessages(data.messages);
          setLiveSteps(data.steps);
        }
      } catch {
        // ignore malformed chunks
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [agentStatus, latestRunId, shouldStream, videoId]);

  const [agentConversationTab, setAgentConversationTab] = useState("chat");
  const activityViewportRef = useRef<HTMLDivElement>(null);
  const activityStickBottomRef = useRef(true);
  const prevAgentConversationTabRef = useRef("chat");

  const scrollActivityToBottom = useCallback(() => {
    const el = activityViewportRef.current;
    if (!el) {
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
  }, []);

  useLayoutEffect(() => {
    const prev = prevAgentConversationTabRef.current;
    prevAgentConversationTabRef.current = agentConversationTab;
    if (agentConversationTab !== "activity") {
      return;
    }
    const justEntered = prev !== "activity";
    if (justEntered) {
      activityStickBottomRef.current = true;
      requestAnimationFrame(() => {
        scrollActivityToBottom();
        requestAnimationFrame(() => scrollActivityToBottom());
      });
    }
  }, [agentConversationTab, scrollActivityToBottom]);

  useEffect(() => {
    const el = activityViewportRef.current;
    if (!el) {
      return;
    }
    const threshold = 48;
    const onScroll = () => {
      activityStickBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (agentConversationTab !== "activity") {
      return;
    }
    if (!activityStickBottomRef.current) {
      return;
    }
    requestAnimationFrame(() => scrollActivityToBottom());
  }, [displaySteps, agentConversationTab, scrollActivityToBottom]);

  if (displayMessages.length === 0 && !latestRunId) {
    return (
      <p className="text-sm text-muted-foreground">
        No agent conversation yet. Send a message below to start a run.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4" />
          Agent conversation
        </h3>
        {shouldStream ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Live stream…
          </span>
        ) : null}
      </div>

      <Tabs onValueChange={setAgentConversationTab} value={agentConversationTab}>
        <TabsList className="h-9">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="raw">Raw events</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-3 min-h-0" value="chat">
          <RecipeAgentChatThreadPanel
            isRunning={shouldStream}
            threadMessages={threadMessages}
          />
        </TabsContent>
        <TabsContent className="mt-3" value="activity">
          <div
            className="h-[min(320px,45vh)] min-h-0 overflow-x-hidden overflow-y-auto rounded-lg border"
            ref={activityViewportRef}
          >
            <ul className="space-y-2 p-2 text-sm">
              {displaySteps.length === 0 ? (
                <li className="text-muted-foreground">No steps recorded for this run.</li>
              ) : (
                displaySteps.map((step) => (
                  <li
                    className="rounded-md border bg-background/80 p-2"
                    key={`${step.agentRunId}-${step.seq}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-foreground">
                        #{step.seq} · {step.stepType}
                      </span>
                      <Badge variant="outline">{step.state}</Badge>
                      {step.label ? (
                        <span className="text-muted-foreground">{step.label}</span>
                      ) : null}
                    </div>
                    {step.detail ? (
                      <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                        {step.detail}
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </TabsContent>
        <TabsContent className="mt-3" value="raw">
          <ScrollArea className="h-[min(280px,40vh)] rounded-lg border pr-3">
            <ul className="space-y-2 p-2 font-mono text-xs">
              {rawTimelineEvents.length === 0 ? (
                <li className="text-muted-foreground">No raw stream events.</li>
              ) : (
                rawTimelineEvents.map((event) => (
                  <li className="rounded-md border bg-muted/20 p-2" key={`${event.id}-${event.seq}`}>
                    <div className="flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        #{event.seq} · {event.eventType}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-muted-foreground">
                      {formatEventPreview(event.payload)}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
