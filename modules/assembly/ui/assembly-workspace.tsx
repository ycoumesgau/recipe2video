"use client";

import { useMemo, useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Player } from "@remotion/player";
import {
  AlertCircle,
  CheckCircle2,
  GripVertical,
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
  AssemblyAudioSync,
  AssemblyRemotionProps,
  AssemblySegmentClip,
} from "@/modules/assembly/assembly.types";
import {
  saveAssemblySettingsAction,
  uploadFinalExportAction,
  type AssemblyActionState,
} from "@/modules/assembly/actions";
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
  missingAcceptedSegments,
  projectStatus,
  projectTitle,
  videoId,
}: {
  compositionId?: string | null;
  finalExports: MediaAsset[];
  initialRemotionProps: AssemblyRemotionProps;
  missingAcceptedSegments: SeedanceSegment[];
  projectStatus: string;
  projectTitle: string;
  videoId: string;
}) {
  const [segments, setSegments] = useState(initialRemotionProps.segments);
  const [audioSync, setAudioSync] = useState<AssemblyAudioSync>(
    initialRemotionProps.audioSync,
  );
  const [saveState, saveAction] = useActionState(
    saveAssemblySettingsAction,
    initialActionState,
  );
  const [exportState, exportAction] = useActionState(
    uploadFinalExportAction,
    initialActionState,
  );
  const sensors = useSensors(useSensor(PointerSensor));
  const remotionProps = useMemo(
    () => ({
      ...initialRemotionProps,
      segments,
      audioSync,
    }),
    [audioSync, initialRemotionProps, segments],
  );
  const durationInFrames = getAssemblyDurationInFrames(remotionProps);
  const segmentOrder = JSON.stringify(
    segments.map((segment) => segment.segmentId),
  );
  const audioSyncValue = JSON.stringify(audioSync);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setSegments((currentSegments) => {
      const oldIndex = currentSegments.findIndex(
        (segment) => segment.segmentId === active.id,
      );
      const newIndex = currentSegments.findIndex(
        (segment) => segment.segmentId === over.id,
      );

      return arrayMove(currentSegments, oldIndex, newIndex);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge className="mb-3" variant="outline">
            Issue #18
          </Badge>
          <h2 className="licorn-page-title">
            Remotion assembly
          </h2>
          <p className="max-w-3xl text-muted-foreground">
            Preview accepted Supabase originals in order, align optional Suno
            audio, and preserve the final MP4 through Supabase Storage before
            Mux playback.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="font-medium">{projectTitle}</p>
          <p className="text-muted-foreground">Project status: {projectStatus}</p>
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.48fr)]">
        <section className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Remotion preview</CardTitle>
              <CardDescription>
                Player source files are signed Supabase Storage originals, not
                Mux HLS streams.
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

          <Card>
            <CardHeader>
              <CardTitle>Selected segments timeline</CardTitle>
              <CardDescription>
                Drag accepted clips to reorder the assembly. Only stored
                originals can be used.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {segments.length > 0 ? (
                <DndContext
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  sensors={sensors}
                >
                  <SortableContext
                    items={segments.map((segment) => segment.segmentId)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {segments.map((segment, index) => (
                        <SortableSegmentCard
                          index={index}
                          key={segment.segmentId}
                          segment={segment}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Accept segment variants before assembling the final sequence.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music2 className="h-4 w-4" />
                Suno music
              </CardTitle>
              <CardDescription>
                Uploaded Suno audio is optional; assembly works without music.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {initialRemotionProps.audio ? (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">{initialRemotionProps.audio.title}</p>
                  <p className="break-all text-xs text-muted-foreground">
                    media_asset: {initialRemotionProps.audio.mediaAssetId}
                  </p>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No music uploaded</AlertTitle>
                  <AlertDescription>
                    Upload a Suno audio asset through the Suno workflow to enable
                    music sync controls.
                  </AlertDescription>
                </Alert>
              )}

              <AudioNumberInput
                label="Audio start offset"
                min={-30}
                onChange={(value) =>
                  setAudioSync((current) => ({
                    ...current,
                    offsetSeconds: value,
                  }))
                }
                suffix="seconds"
                value={audioSync.offsetSeconds}
              />
              <AudioNumberInput
                label="Cut from audio"
                min={0}
                onChange={(value) =>
                  setAudioSync((current) => ({
                    ...current,
                    cutFromSeconds: value,
                  }))
                }
                suffix="seconds"
                value={audioSync.cutFromSeconds}
              />
              <AudioNumberInput
                label="Fade in"
                min={0}
                onChange={(value) =>
                  setAudioSync((current) => ({
                    ...current,
                    fadeInSeconds: value,
                  }))
                }
                suffix="seconds"
                value={audioSync.fadeInSeconds}
              />
              <AudioNumberInput
                label="Fade out"
                min={0}
                onChange={(value) =>
                  setAudioSync((current) => ({
                    ...current,
                    fadeOutSeconds: value,
                  }))
                }
                suffix="seconds"
                value={audioSync.fadeOutSeconds}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export panel</CardTitle>
              <CardDescription>
                Save the current order and upload the final rendered MP4 for
                durable storage plus Mux playback.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={saveAction} className="space-y-3">
                <HiddenAssemblyFields
                  audioMediaAssetId={initialRemotionProps.audio?.mediaAssetId}
                  audioSyncValue={audioSyncValue}
                  segmentOrder={segmentOrder}
                  videoId={videoId}
                />
                <SaveButton disabled={segments.length === 0} />
              </form>

              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                Client-side Remotion rendering is not wired in this repo yet.
                For the hackathon path, render the preview externally or locally,
                then upload the final MP4 here so Supabase remains the durable
                source of truth and Mux remains playback only.
              </div>

              <form action={exportAction} className="space-y-3">
                <HiddenAssemblyFields
                  audioMediaAssetId={initialRemotionProps.audio?.mediaAssetId}
                  audioSyncValue={audioSyncValue}
                  segmentOrder={segmentOrder}
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
    </div>
  );
}

function HiddenAssemblyFields({
  audioMediaAssetId,
  audioSyncValue,
  segmentOrder,
  videoId,
}: {
  audioMediaAssetId?: string | null;
  audioSyncValue: string;
  segmentOrder: string;
  videoId: string;
}) {
  return (
    <>
      <input name="videoId" type="hidden" value={videoId} />
      <input name="segmentOrder" type="hidden" value={segmentOrder} />
      <input name="audioSync" type="hidden" value={audioSyncValue} />
      <input
        name="audioMediaAssetId"
        type="hidden"
        value={audioMediaAssetId ?? ""}
      />
    </>
  );
}

function SortableSegmentCard({
  index,
  segment,
}: {
  index: number;
  segment: AssemblySegmentClip;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: segment.segmentId });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      className="flex items-center gap-3 rounded-lg border bg-card p-3"
    >
      <button
        {...listeners}
        aria-label={`Reorder ${segment.title}`}
        className="cursor-grab rounded-md border p-2 text-muted-foreground"
        type="button"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{segment.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {segment.durationSeconds}s · {segment.storageBucket}/
          {segment.storagePath}
        </p>
      </div>
      <Badge variant="outline">Supabase original</Badge>
    </div>
  );
}

function AudioNumberInput({
  label,
  min,
  onChange,
  suffix,
  value,
}: {
  label: string;
  min: number;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step="0.1"
          type="number"
          value={value}
        />
        <span className="w-16 text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} type="submit" variant="outline">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
