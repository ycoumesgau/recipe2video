"use client";

import { useMemo, useState } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { extractSegmentFrameAction } from "@/modules/references/actions";

interface FrameExtractionCardProps {
  videoId: string;
  segmentId: string;
  /** Mux playback id of the segment's currently-selected variant. */
  muxPlaybackId: string | null | undefined;
  /** Duration of the segment's selected variant. Used to bound the slider. */
  durationSeconds: number | null | undefined;
}

/**
 * Interactive timeline scrub + Mux thumbnail preview + extract button.
 *
 * Renders a `<input type=range>` slider over the segment's duration
 * (defaults to 5s when the duration is unknown — Seedance's minimum)
 * and a live `<img>` preview pointing at the Mux thumbnail at the
 * current timestamp. Submitting the form posts to
 * `extractSegmentFrameAction`, which downloads the PNG, persists it as
 * a recipe-specific `reference_assets` row, and surfaces a notice
 * banner with the new canonical name.
 */
export function FrameExtractionCard({
  videoId,
  segmentId,
  muxPlaybackId,
  durationSeconds,
}: FrameExtractionCardProps) {
  const maxSeconds = useMemo(() => {
    if (typeof durationSeconds === "number" && durationSeconds > 0) {
      return durationSeconds;
    }
    return 5;
  }, [durationSeconds]);

  const [timestampSeconds, setTimestampSeconds] = useState(() =>
    Math.min(2.5, maxSeconds),
  );
  const [canonicalName, setCanonicalName] = useState("");
  const [prompt, setPrompt] = useState("");

  const previewUrl = useMemo(() => {
    if (!muxPlaybackId) return null;
    const params = new URLSearchParams({
      time: timestampSeconds.toFixed(2),
      width: "540",
      height: "960",
    });
    return `https://image.mux.com/${encodeURIComponent(muxPlaybackId)}/thumbnail.png?${params.toString()}`;
  }, [muxPlaybackId, timestampSeconds]);

  if (!muxPlaybackId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Frame extraction
          </CardTitle>
          <CardDescription>
            Extract a single PNG frame from this segment to use as a
            continuity anchor on a downstream segment (e.g. for a sliced
            dish, a half-eaten plate, or any state that must persist
            across cuts).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Frame extraction is unlocked once the segment has been uploaded
            to Mux. Wait for the latest variant to finish processing and
            refresh this page.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Frame extraction
        </CardTitle>
        <CardDescription>
          Scrub the timeline, preview the frame, and extract it as a
          recipe-specific reference. The extracted image lands in the
          asset list and can be attached to any downstream segment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-lg border bg-muted/40">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Mux thumbnail must hit the public CDN directly; next/image cannot loader-rewrite this off-domain URL without explicit remote config.
            <img
              alt="Mux thumbnail preview"
              className="aspect-[9/16] w-full object-cover"
              src={previewUrl}
            />
          ) : (
            <div className="flex aspect-[9/16] items-center justify-center text-sm text-muted-foreground">
              <ImageIcon className="mr-2 h-4 w-4" /> No preview available.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="timestampSlider">
              Timestamp
            </Label>
            <Badge variant="secondary">
              {timestampSeconds.toFixed(2)}s / {maxSeconds.toFixed(2)}s
            </Badge>
          </div>
          <input
            className="w-full"
            id="timestampSlider"
            max={maxSeconds}
            min={0}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) {
                setTimestampSeconds(next);
              }
            }}
            step={0.05}
            type="range"
            value={timestampSeconds}
          />
        </div>

        <form action={extractSegmentFrameAction} className="space-y-3">
          <input name="videoId" type="hidden" value={videoId} />
          <input name="sourceSegmentId" type="hidden" value={segmentId} />
          <input
            name="timestampSeconds"
            type="hidden"
            value={timestampSeconds.toFixed(2)}
          />
          <div className="space-y-2">
            <Label htmlFor="canonicalName">
              Canonical name (optional)
            </Label>
            <Input
              id="canonicalName"
              name="canonicalName"
              onChange={(event) => setCanonicalName(event.target.value)}
              placeholder="e.g. SlicedLasagnaFrame"
              value={canonicalName}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to auto-generate a name from the segment title and
              timestamp. The canonical name is what the agent uses in
              `seedance-segments.json` and in `reference-plan.json`.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="extractedFramePrompt">
              Description (optional)
            </Label>
            <Input
              id="extractedFramePrompt"
              name="prompt"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. Glossy paris-brest with a slice missing"
              value={prompt}
            />
          </div>
          <Button className="w-full" type="submit">
            <Camera className="mr-1 h-4 w-4" />
            Extract this frame as reference
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
