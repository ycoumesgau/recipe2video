"use client";

import { useEffect, useState } from "react";
import { Clock, Cpu, Film, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  RENDER_PHASE_LABELS,
  computeRenderProgressDisplay,
  formatDurationSeconds,
  type RenderProgress,
} from "@/modules/assembly/render-progress";

/**
 * Visual snapshot of an in-flight cloud render. Reads the latest
 * {@link RenderProgress} fetched server-side (via the `GenerationRscSync`
 * polling loop already wired on the Assembly page) and re-derives ETA / fps
 * / elapsed locally every second so the labels keep ticking even between
 * server roundtrips.
 */
export function CloudRenderProgressCard({
  progress,
}: {
  progress: RenderProgress;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const display = computeRenderProgressDisplay(progress, now);
  const phaseLabel = RENDER_PHASE_LABELS[progress.phase];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Loader2
            aria-hidden
            className={cn(
              "h-4 w-4",
              display.isStale ? "text-muted-foreground" : "animate-spin",
            )}
          />
          Cloud render in progress
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{phaseLabel}</Badge>
          {display.isStale ? (
            <Badge variant="destructive">No update in over a minute</Badge>
          ) : null}
          {progress.sandboxId ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              {progress.sandboxId}
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{display.percent}%</span>
            <span className="text-muted-foreground">
              Elapsed {formatDurationSeconds(display.elapsedSeconds)}
            </span>
          </div>
          <Progress value={display.percent} />
        </div>

        <dl className="grid grid-cols-3 gap-3 text-xs">
          <Stat
            icon={<Film className="h-3.5 w-3.5" />}
            label="Frames"
            value={
              progress.totalFrames && progress.renderedFrames != null
                ? `${formatNumber(progress.renderedFrames)} / ${formatNumber(progress.totalFrames)}`
                : progress.totalFrames
                  ? `0 / ${formatNumber(progress.totalFrames)}`
                  : "—"
            }
          />
          <Stat
            icon={<Cpu className="h-3.5 w-3.5" />}
            label="Speed"
            value={display.fps ? `${display.fps.toFixed(1)} fps` : "—"}
          />
          <Stat
            icon={<Clock className="h-3.5 w-3.5" />}
            label="ETA"
            value={
              display.etaSeconds != null
                ? formatDurationSeconds(display.etaSeconds)
                : "—"
            }
          />
        </dl>

        <p className="text-xs text-muted-foreground">
          The page refreshes every few seconds while the Vercel Sandbox runs.
          The frame counter only appears once Remotion enters the rendering
          phase; before that the bar advances on the dnf / npm / bundle
          milestones.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm font-medium">{value}</dd>
    </div>
  );
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}
