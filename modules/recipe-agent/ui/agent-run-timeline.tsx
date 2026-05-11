"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";

import type { AgentRunTimelineEvent } from "../recipe-agent.types";
import type { RecipeAgentStatus } from "../recipe-agent.types";

type TimelineApiResponse = {
  runId: string | null;
  events: AgentRunTimelineEvent[];
};

function formatEventPreview(payload: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(payload);
    return json.length > 280 ? `${json.slice(0, 277)}…` : json;
  } catch {
    return "(payload)";
  }
}

function initialEventsHydrationKey(
  latestRunId: string | null,
  events: AgentRunTimelineEvent[],
) {
  const tail = events
    .slice(-12)
    .map((event) => `${event.id}:${event.seq}`)
    .join("|");
  return `${latestRunId ?? "none"}:${events.length}:${tail}`;
}

export function AgentRunTimeline(props: {
  videoId: string;
  agentStatus: RecipeAgentStatus;
  latestRunId: string | null;
  initialEvents: AgentRunTimelineEvent[];
}) {
  const { videoId, latestRunId, initialEvents } = props;

  const hydrationKey = initialEventsHydrationKey(latestRunId, initialEvents);

  return (
    <AgentRunTimelineInner
      key={`${videoId}:${hydrationKey}`}
      {...props}
    />
  );
}

function AgentRunTimelineInner({
  videoId,
  agentStatus,
  latestRunId,
  initialEvents,
}: {
  videoId: string;
  agentStatus: RecipeAgentStatus;
  latestRunId: string | null;
  initialEvents: AgentRunTimelineEvent[];
}) {
  const [events, setEvents] = useState<AgentRunTimelineEvent[]>(initialEvents);
  const [pollError, setPollError] = useState<string | null>(null);
  const shouldPoll = agentStatus === "running" && Boolean(latestRunId);

  const refresh = useCallback(async () => {
    if (!latestRunId) {
      return;
    }

    try {
      const res = await fetch(
        `/api/videos/${videoId}/agent-timeline?runId=${encodeURIComponent(latestRunId)}`,
        { cache: "no-store" },
      );

      if (!res.ok) {
        setPollError("Unable to refresh agent timeline.");
        return;
      }

      const body = (await res.json()) as TimelineApiResponse;
      setPollError(null);
      setEvents(body.events);
    } catch {
      setPollError("Unable to refresh agent timeline.");
    }
  }, [latestRunId, videoId]);

  useEffect(() => {
    if (!shouldPoll || !latestRunId) {
      return;
    }

    const id = window.setInterval(() => {
      void refresh();
    }, 3500);

    const kickoffId = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      clearInterval(id);
      clearTimeout(kickoffId);
    };
  }, [latestRunId, refresh, shouldPoll]);

  if (!latestRunId && events.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-muted/10 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4" />
          Live agent timeline
        </h3>
        {shouldPoll ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Polling Cursor stream…
          </span>
        ) : null}
      </div>
      {pollError ? (
        <p className="mb-2 text-xs text-destructive">{pollError}</p>
      ) : null}
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {agentStatus === "running"
            ? "Waiting for the first streamed event from Cursor…"
            : "No stream events were recorded for this run."}
        </p>
      ) : (
        <div className="max-h-[min(320px,45vh)] overflow-y-auto pr-1">
          <ul className="space-y-2 text-sm">
            {events.map((event) => (
              <li
                className="rounded-md border bg-background/80 p-2 font-mono text-xs"
                key={`${event.id}-${event.seq}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="font-heading font-bold text-foreground">
                    #{event.seq} · {event.eventType}
                  </span>
                  <span>{formatTimelineTime(event.createdAt)}</span>
                </div>
                <p className="mt-1 break-words text-muted-foreground">
                  {formatEventPreview(event.payload)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatTimelineTime(iso: string) {
  return new Intl.DateTimeFormat("en", {
    timeStyle: "medium",
    dateStyle: "short",
  }).format(new Date(iso));
}
