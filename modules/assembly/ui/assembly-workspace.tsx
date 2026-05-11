"use client";

import {
  useActionState,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { Player, type PlayerRef } from "@remotion/player";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Music2,
  Save,
  UploadCloud,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  AssemblyAudioClip,
  AssemblyRemotionProps,
  AssemblySegmentClip,
  AssemblyTimelineState,
} from "@/modules/assembly/assembly.types";
import {
  saveAssemblySettingsAction,
  uploadFinalExportAction,
  type AssemblyActionState,
} from "@/modules/assembly/actions";
import {
  AddAudioClipButton,
  TimelineEditor,
} from "@/modules/assembly/ui/timeline-editor";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import { RecipeMuxPlayer } from "@/modules/media-assets/ui/mux-player";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import {
  getAssemblyDurationInFrames,
  RecipeAssemblyComposition,
} from "@/remotion/compositions/recipe-assembly";

const initialActionState: AssemblyActionState = {};

export function AssemblyWorkspace({
  compositionId,
  finalExports,
  initialRemotionProps,
  initialTimelineState,
  missingAcceptedSegments,
  projectStatus,
  projectTitle,
  videoId,
}: {
  compositionId?: string | null;
  finalExports: MediaAsset[];
  initialRemotionProps: AssemblyRemotionProps;
  initialTimelineState: AssemblyTimelineState;
  missingAcceptedSegments: SeedanceSegment[];
  projectStatus: string;
  projectTitle: string;
  videoId: string;
}) {
  const [segments, setSegments] = useState<AssemblySegmentClip[]>(
    initialRemotionProps.segments,
  );
  const [audioClips, setAudioClips] = useState<AssemblyAudioClip[]>(
    initialTimelineState.audioClips,
  );
  const [saveState, saveAction] = useActionState(
    saveAssemblySettingsAction,
    initialActionState,
  );
  const [exportState, exportAction] = useActionState(
    uploadFinalExportAction,
    initialActionState,
  );
  const playerRef = useRef<PlayerRef | null>(null);

  const remotionProps = useMemo(
    () => ({
      ...initialRemotionProps,
      segments,
      audioClips,
    }),
    [audioClips, initialRemotionProps, segments],
  );
  const durationInFrames = getAssemblyDurationInFrames(remotionProps);

  const placementsJson = useMemo(
    () =>
      JSON.stringify({
        schema: "placements_v1",
        placements: segments.map((segment) => ({
          placementId: segment.placementId,
          segmentId: segment.segmentId,
          inSeconds: segment.inSeconds,
          outSeconds: segment.outSeconds,
        })),
      }),
    [segments],
  );

  const timelineStateValue = useMemo<AssemblyTimelineState>(
    () => ({ schema: "timeline_v2", audioClips }),
    [audioClips],
  );
  const timelineStateJson = useMemo(
    () => JSON.stringify(timelineStateValue),
    [timelineStateValue],
  );

  const handleSegmentsChange = useCallback((next: AssemblySegmentClip[]) => {
    setSegments(next);
  }, []);
  const handleAudioClipsChange = useCallback((next: AssemblyAudioClip[]) => {
    setAudioClips(next);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge className="mb-3" variant="outline">
            Issue #18
          </Badge>
          <h2 className="licorn-page-title">Remotion assembly</h2>
          <p className="max-w-3xl text-muted-foreground">
            Trim accepted Supabase originals on a real timeline, position the
            optional Suno audio with waveform and fades, and preserve the final
            MP4 through Supabase Storage before Mux playback.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">{projectTitle}</p>
          <p className="text-muted-foreground">
            Project status: {projectStatus}
          </p>
        </div>
      </div>

      <ActionNotice state={saveState} title="Assembly settings" />
      <ActionNotice state={exportState} title="Final export" />

      {missingAcceptedSegments.length > 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Some accepted segments are missing originals</AlertTitle>
          <AlertDescription>
            {missingAcceptedSegments.length} accepted segment(s) do not have a
            Supabase-stored accepted clip or selected Runway output yet. They
            are excluded from the Remotion preview.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.4fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Remotion preview</CardTitle>
            <CardDescription>
              Player source files are signed Supabase Storage originals, not
              Mux HLS streams. The timeline below drives the player.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {segments.length > 0 ? (
              <div className="overflow-hidden rounded-xl border bg-black">
                <Player
                  component={RecipeAssemblyComposition}
                  compositionHeight={initialRemotionProps.height}
                  compositionWidth={initialRemotionProps.width}
                  controls
                  durationInFrames={durationInFrames}
                  fps={initialRemotionProps.fps}
                  inputProps={remotionProps}
                  ref={playerRef}
                  style={{
                    aspectRatio: `${initialRemotionProps.width} / ${initialRemotionProps.height}`,
                    maxHeight: 720,
                    width: "100%",
                  }}
                />
              </div>
            ) : (
              <EmptyPreview />
            )}
          </CardContent>
        </Card>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music2 className="h-4 w-4" />
                Audio details
              </CardTitle>
              <CardDescription>
                Fine-tune the selected audio clip, or use the timeline above
                for direct manipulation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {initialRemotionProps.audio ? (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">
                    {initialRemotionProps.audio.title}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    media_asset: {initialRemotionProps.audio.mediaAssetId}
                  </p>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No music uploaded</AlertTitle>
                  <AlertDescription>
                    Upload a Suno audio asset through the Suno workflow to
                    enable audio editing.
                  </AlertDescription>
                </Alert>
              )}

              {audioClips.length > 0 ? (
                <AudioClipDetails
                  clips={audioClips}
                  onChange={handleAudioClipsChange}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export panel</CardTitle>
              <CardDescription>
                Save the current timeline and upload the final rendered MP4
                for durable storage plus Mux playback.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={saveAction} className="space-y-3">
                <HiddenAssemblyFields
                  audioMediaAssetId={initialRemotionProps.audio?.mediaAssetId}
                  placements={placementsJson}
                  timelineState={timelineStateJson}
                  videoId={videoId}
                />
                <SaveButton disabled={segments.length === 0} />
              </form>

              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                Client-side Remotion rendering is not wired in this repo yet.
                For the hackathon path, render the preview externally or
                locally, then upload the final MP4 here so Supabase remains
                the durable source of truth and Mux remains playback only.
              </div>

              <form action={exportAction} className="space-y-3">
                <HiddenAssemblyFields
                  audioMediaAssetId={initialRemotionProps.audio?.mediaAssetId}
                  placements={placementsJson}
                  timelineState={timelineStateJson}
                  videoId={videoId}
                />
                <input
                  name="compositionId"
                  type="hidden"
                  value={saveState.compositionId ?? compositionId ?? ""}
                />
                <div className="space-y-2">
                  <Label htmlFor="finalExport">Final MP4 export</Label>
                  <Input
                    accept="video/mp4,.mp4"
                    id="finalExport"
                    name="finalExport"
                    type="file"
                  />
                </div>
                <ExportButton disabled={segments.length === 0} />
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Final playback</CardTitle>
              <CardDescription>
                Completed exports appear here once Mux returns a playback ID.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {finalExports.length > 0 ? (
                finalExports.map((asset) => (
                  <div className="space-y-2" key={asset.id}>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{asset.status}</Badge>
                      <Badge variant="outline">final_export</Badge>
                    </div>
                    <RecipeMuxPlayer
                      playbackId={asset.muxPlaybackId}
                      title={asset.originalFilename ?? "Final export"}
                    />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No final export has been stored yet.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timeline editor</CardTitle>
          <CardDescription>
            Drag clips to reorder, drag clip edges to trim (the change commits
            on release so you can read the magnitude before letting go), drag
            audio anywhere on the timeline, and pull the corner to fade. Snaps
            to the playhead and to neighbouring clip edges.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {segments.length > 0 ? (
            <TimelineEditor
              audioClips={audioClips}
              audioTrack={initialRemotionProps.audio ?? null}
              fps={initialRemotionProps.fps}
              onAudioClipsChange={handleAudioClipsChange}
              onSegmentsChange={handleSegmentsChange}
              playerRef={playerRef}
              segments={segments}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Accept segment variants before assembling the final sequence.
            </p>
          )}
          <AddAudioClipButton
            audioClips={audioClips}
            audioTrack={initialRemotionProps.audio ?? null}
            onChange={handleAudioClipsChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function HiddenAssemblyFields({
  audioMediaAssetId,
  placements,
  timelineState,
  videoId,
}: {
  audioMediaAssetId?: string | null;
  placements: string;
  timelineState: string;
  videoId: string;
}) {
  return (
    <>
      <input name="videoId" type="hidden" value={videoId} />
      <input name="placements" type="hidden" value={placements} />
      <input name="timelineState" type="hidden" value={timelineState} />
      <input
        name="audioMediaAssetId"
        type="hidden"
        value={audioMediaAssetId ?? ""}
      />
    </>
  );
}

function AudioClipDetails({
  clips,
  onChange,
}: {
  clips: AssemblyAudioClip[];
  onChange: (next: AssemblyAudioClip[]) => void;
}) {
  return (
    <div className="space-y-4">
      {clips.map((clip, index) => (
        <div
          className="rounded-lg border bg-muted/20 p-3 text-xs"
          key={clip.id}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">Audio clip #{index + 1}</span>
            <Button
              onClick={() =>
                onChange(clips.filter((existing) => existing.id !== clip.id))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Remove
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Start"
              min={0}
              onChange={(value) =>
                onChange(
                  clips.map((existing) =>
                    existing.id === clip.id
                      ? { ...existing, startOnTimelineSeconds: value }
                      : existing,
                  ),
                )
              }
              suffix="s"
              value={clip.startOnTimelineSeconds}
            />
            <NumberField
              label="In point"
              min={0}
              onChange={(value) =>
                onChange(
                  clips.map((existing) =>
                    existing.id === clip.id
                      ? {
                          ...existing,
                          inSeconds: Math.min(
                            value,
                            existing.outSeconds - 0.1,
                          ),
                        }
                      : existing,
                  ),
                )
              }
              suffix="s"
              value={clip.inSeconds}
            />
            <NumberField
              label="Out point"
              min={0}
              onChange={(value) =>
                onChange(
                  clips.map((existing) =>
                    existing.id === clip.id
                      ? {
                          ...existing,
                          outSeconds: Math.max(
                            value,
                            existing.inSeconds + 0.1,
                          ),
                        }
                      : existing,
                  ),
                )
              }
              suffix="s"
              value={clip.outSeconds}
            />
            <NumberField
              label="Volume"
              max={2}
              min={0}
              onChange={(value) =>
                onChange(
                  clips.map((existing) =>
                    existing.id === clip.id
                      ? { ...existing, volume: value }
                      : existing,
                  ),
                )
              }
              step={0.05}
              suffix="x"
              value={clip.volume}
            />
            <NumberField
              label="Fade in"
              min={0}
              onChange={(value) =>
                onChange(
                  clips.map((existing) =>
                    existing.id === clip.id
                      ? { ...existing, fadeInSeconds: value }
                      : existing,
                  ),
                )
              }
              suffix="s"
              value={clip.fadeInSeconds}
            />
            <NumberField
              label="Fade out"
              min={0}
              onChange={(value) =>
                onChange(
                  clips.map((existing) =>
                    existing.id === clip.id
                      ? { ...existing, fadeOutSeconds: value }
                      : existing,
                  ),
                )
              }
              suffix="s"
              value={clip.fadeOutSeconds}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function NumberField({
  label,
  max,
  min,
  onChange,
  step = 0.1,
  suffix,
  value,
}: {
  label: string;
  max?: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  suffix: string;
  value: number;
}) {
  return (
    <label className="space-y-1 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Input
          className="h-7 text-xs"
          max={max}
          min={min}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              onChange(next);
            }
          }}
          step={step}
          type="number"
          value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
        />
        <span className="w-3 text-[10px] text-muted-foreground">{suffix}</span>
      </div>
    </label>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} type="submit" variant="outline">
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      Save assembly settings
    </Button>
  );
}

function ExportButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} type="submit">
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <UploadCloud className="h-4 w-4" />
      )}
      Store final MP4 and upload to Mux
    </Button>
  );
}

function ActionNotice({
  state,
  title,
}: {
  state: AssemblyActionState;
  title: string;
}) {
  if (!state.message) {
    return null;
  }

  return (
    <Alert variant={state.status === "error" ? "destructive" : "default"}>
      {state.status === "error" ? (
        <AlertCircle className="h-4 w-4" />
      ) : (
        <CheckCircle2 className="h-4 w-4" />
      )}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {state.message}
        {state.muxPlaybackId ? (
          <span className="mt-2 block font-mono text-xs">
            mux_playback_id: {state.muxPlaybackId}
          </span>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function EmptyPreview() {
  return (
    <div className="flex aspect-[9/16] max-h-[720px] items-center justify-center rounded-xl border bg-muted text-center text-sm text-muted-foreground">
      No accepted Supabase-stored clips are available for Remotion preview yet.
    </div>
  );
}
