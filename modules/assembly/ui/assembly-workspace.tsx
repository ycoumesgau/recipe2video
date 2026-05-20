"use client";

import {
  useActionState,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Player, type PlayerRef } from "@remotion/player";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  MoreHorizontal,
  Music2,
  Pencil,
  Plus,
  Save,
  Trash2,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GenerationRscSync } from "@/modules/generation/ui/generation-rsc-sync";
import type {
  AssemblyAudioClip,
  AssemblyPreset,
  AssemblyRemotionProps,
  AssemblySegmentClip,
  AssemblyTimelineState,
} from "@/modules/assembly/assembly.types";
import {
  deleteAssemblyPresetAction,
  renameAssemblyPresetAction,
  requestAssemblyRenderAction,
  saveAssemblyPresetAsNewAction,
  saveAssemblySettingsAction,
  type AssemblyActionState,
} from "@/modules/assembly/actions";
import type { ExportStatus } from "@/modules/assembly/export-status";
import type { RenderProgress } from "@/modules/assembly/render-progress";
import { generatePlacementId } from "@/modules/assembly/timeline-state";
import type { AssemblyFinalExport } from "@/modules/assembly/use-cases/get-assembly-data";
import { VideoClipMixSection } from "@/modules/assembly/ui/audio-mix-panel";
import { CloudRenderProgressCard } from "@/modules/assembly/ui/cloud-render-progress-card";
import { SegmentBin } from "@/modules/assembly/ui/segment-bin";
import {
  AddAudioClipButton,
  TimelineEditor,
} from "@/modules/assembly/ui/timeline-editor";
import { useActivePresetId } from "@/modules/assembly/ui/use-active-preset-id";
import { RecipeMuxPlayer } from "@/modules/media-assets/ui/mux-player";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import {
  getAssemblyDurationInFrames,
  RecipeAssemblyComposition,
} from "@/remotion/compositions/recipe-assembly";

const initialActionState: AssemblyActionState = {};

const ALL_PRESETS_FILTER = "__all__";

export function AssemblyWorkspace({
  activePresetId: serverActivePresetId,
  availableSegments,
  compositionExportStatus = "pending",
  finalExports,
  initialRemotionProps,
  initialTimelineState,
  missingAcceptedSegments,
  presets,
  projectStatus,
  projectTitle,
  renderProgress = null,
  videoId,
}: {
  activePresetId: string | null;
  /**
   * Catalogue of every accepted Seedance segment that has a stored media
   * asset. Drives the {@link SegmentBin} sidebar and is also the source of
   * truth for the editor when a segment is dropped from the bin onto the
   * timeline (we look up the metadata here and materialise a placement).
   */
  availableSegments: AssemblySegmentClip[];
  compositionExportStatus?: ExportStatus;
  /** Past Supabase-stored MP4 exports, newest first, each with a fresh
   *  signed download URL. */
  finalExports: AssemblyFinalExport[];
  initialRemotionProps: AssemblyRemotionProps;
  initialTimelineState: AssemblyTimelineState;
  missingAcceptedSegments: SeedanceSegment[];
  presets: AssemblyPreset[];
  projectStatus: string;
  projectTitle: string;
  /**
   * Latest cloud-render progress snapshot from
   * `compositions.render_progress`. Surfaced from the page loader so we can
   * show a live progress bar while the Vercel Sandbox is running.
   */
  renderProgress?: RenderProgress | null;
  videoId: string;
}) {
  const [segments, setSegments] = useState<AssemblySegmentClip[]>(
    initialRemotionProps.segments,
  );
  const [audioClips, setAudioClips] = useState<AssemblyAudioClip[]>(
    initialTimelineState.audioClips,
  );
  const { activePresetId, setActivePresetId } = useActivePresetId(
    videoId,
    presets,
    serverActivePresetId,
  );
  const activePreset = presets.find((preset) => preset.id === activePresetId);
  const [saveAsNewOpen, setSaveAsNewOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [renamePresetName, setRenamePresetName] = useState(
    activePreset?.name ?? "",
  );
  const [playbackPresetFilter, setPlaybackPresetFilter] = useState<string>(
    activePresetId ?? ALL_PRESETS_FILTER,
  );
  const playerRef = useRef<PlayerRef | null>(null);

  const saveAsNewActionWrapper = useCallback(
    async (
      previousState: AssemblyActionState,
      formData: FormData,
    ): Promise<AssemblyActionState> => {
      const result = await saveAssemblyPresetAsNewAction(previousState, formData);
      if (result.status === "success" && result.presetId) {
        setSaveAsNewOpen(false);
        setNewPresetName("");
        setActivePresetId(result.presetId);
        setPlaybackPresetFilter(result.presetId);
      }
      return result;
    },
    [setActivePresetId],
  );

  const [saveState, saveAction] = useActionState(
    saveAssemblySettingsAction,
    initialActionState,
  );
  const [saveAsNewState, saveAsNewAction] = useActionState(
    saveAsNewActionWrapper,
    initialActionState,
  );
  const [renameState, renameAction] = useActionState(
    renameAssemblyPresetAction,
    initialActionState,
  );
  const [deleteState, deleteAction] = useActionState(
    deleteAssemblyPresetAction,
    initialActionState,
  );
  const [renderState, renderAction] = useActionState(
    requestAssemblyRenderAction,
    initialActionState,
  );

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      setActivePresetId(presetId);
      setPlaybackPresetFilter(presetId);
    },
    [setActivePresetId],
  );

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
          volume: segment.volume,
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

  /**
   * Materialise a fresh placement from the catalogue and insert it at
   * `insertIndex` in the timeline. Used both by the bin's drag-and-drop
   * onto the video lane and the bin card's "+" append button.
   */
  const handleAddSegmentFromBin = useCallback(
    (segmentId: string, insertIndex: number) => {
      const catalogueEntry = availableSegments.find(
        (segment) => segment.segmentId === segmentId,
      );
      if (!catalogueEntry) {
        return;
      }
      setSegments((current) => {
        const safeIndex = Math.max(0, Math.min(insertIndex, current.length));
        const newClip: AssemblySegmentClip = {
          ...catalogueEntry,
          placementId: generatePlacementId(),
          position: safeIndex,
          inSeconds: 0,
          outSeconds: catalogueEntry.durationSeconds,
          volume: 1,
        };
        return [
          ...current.slice(0, safeIndex),
          newClip,
          ...current.slice(safeIndex),
        ];
      });
    },
    [availableSegments],
  );
  const handleSegmentDroppedFromBin = useCallback(
    ({ segmentId, insertIndex }: { segmentId: string; insertIndex: number }) =>
      handleAddSegmentFromBin(segmentId, insertIndex),
    [handleAddSegmentFromBin],
  );
  const handleAppendSegmentFromBin = useCallback(
    (segmentId: string) => handleAddSegmentFromBin(segmentId, segments.length),
    [handleAddSegmentFromBin, segments.length],
  );

  const filteredFinalExports = useMemo(() => {
    if (playbackPresetFilter === ALL_PRESETS_FILTER) {
      return finalExports;
    }
    return finalExports.filter(
      (entry) => entry.presetId === playbackPresetFilter,
    );
  }, [finalExports, playbackPresetFilter]);

  const latestFilteredExport = filteredFinalExports[0] ?? null;

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
      <ActionNotice state={saveAsNewState} title="New assembly preset" />
      <ActionNotice state={renameState} title="Rename preset" />
      <ActionNotice state={deleteState} title="Delete preset" />
      <ActionNotice state={renderState} title="Cloud render" />

      {compositionExportStatus === "rendering" && renderProgress ? (
        <CloudRenderProgressCard progress={renderProgress} />
      ) : null}

      <GenerationRscSync
        enabled={compositionExportStatus === "rendering"}
        pollMs={5000}
      />

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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.38fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Remotion preview</CardTitle>
              <CardDescription>
                Player source files are signed Supabase Storage originals, not
                Mux HLS streams. The timeline in the next card drives the player.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {segments.length > 0 ? (
                <div className="overflow-hidden rounded-xl border bg-black">
                  <Player
                    acknowledgeRemotionLicense
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

          <Card>
            <CardHeader>
              <CardTitle>Timeline editor</CardTitle>
              <CardDescription>
                Drag clips to reorder, drag clip edges to trim (the change commits
                on release so you can read the magnitude before letting go), drag
                audio anywhere on the timeline, and pull the corner to fade. Drag
                a card from the bin onto the video lane to add a placement; press
                <kbd className="mx-1 rounded border bg-muted px-1">S</kbd>
                to split a selected clip at the playhead and
                <kbd className="mx-1 rounded border bg-muted px-1">Del</kbd>
                to remove it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SegmentBin
                availableSegments={availableSegments}
                onAppend={handleAppendSegmentFromBin}
              />
              {segments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Drag a card from the bin onto the video lane below to start the
                  timeline. Drops snap to the closest clip boundary.
                </p>
              ) : null}
              <TimelineEditor
                audioClips={audioClips}
                audioTrack={initialRemotionProps.audio ?? null}
                fps={initialRemotionProps.fps}
                onAudioClipsChange={handleAudioClipsChange}
                onSegmentDroppedFromBin={handleSegmentDroppedFromBin}
                onSegmentsChange={handleSegmentsChange}
                playerRef={playerRef}
                segments={segments}
              />
              <AddAudioClipButton
                audioClips={audioClips}
                audioTrack={initialRemotionProps.audio ?? null}
                onChange={handleAudioClipsChange}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="min-w-0 space-y-6 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:pr-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music2 className="h-4 w-4" />
                Audio mix
              </CardTitle>
              <CardDescription>
                Balance the diegetic video audio against the music. To change
                volume on a sub-zone of a clip, split it on the timeline and
                set a different volume on each piece.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <VideoClipMixSection
                onChange={handleSegmentsChange}
                segments={segments}
              />

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
                  <AlertDescription className="space-y-2">
                    <p>
                      Upload a Suno audio asset on the Music page to enable
                      music mixing here.
                    </p>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/videos/${videoId}/music`}>Open Music</Link>
                    </Button>
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
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Export panel</CardTitle>
            <CardDescription>
              Save the timeline, render an MP4 in a Vercel Sandbox, then
              download the latest export to upload to socials.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AssemblyPresetToolbar
              activePreset={activePreset}
              activePresetId={activePresetId}
              onRenameOpen={() => {
                setRenamePresetName(activePreset?.name ?? "");
                setRenameOpen(true);
              }}
              onSaveAsNewOpen={() => setSaveAsNewOpen(true)}
              deleteAction={deleteAction}
              deleteState={deleteState}
              onSelectPreset={handleSelectPreset}
              presets={presets}
              videoId={videoId}
            />

            <form action={saveAction} className="space-y-3">
              <HiddenAssemblyFields
                audioMediaAssetId={initialRemotionProps.audio?.mediaAssetId}
                placements={placementsJson}
                presetId={activePresetId}
                timelineState={timelineStateJson}
                videoId={videoId}
              />
              <SaveButton disabled={segments.length === 0} />
            </form>

            <form action={renderAction} className="space-y-3">
              <HiddenAssemblyFields
                audioMediaAssetId={initialRemotionProps.audio?.mediaAssetId}
                placements={placementsJson}
                presetId={activePresetId}
                timelineState={timelineStateJson}
                videoId={videoId}
              />
              <RenderCloudButton
                disabled={
                  segments.length === 0 ||
                  !activePresetId ||
                  compositionExportStatus === "rendering"
                }
              />
            </form>

            <DownloadLatestExportButton
              latestExport={latestFilteredExport}
              renderInFlight={compositionExportStatus === "rendering"}
            />

            {compositionExportStatus === "failed" ? (
              <p className="text-xs font-medium text-destructive">
                Last cloud render failed. Fix any issues, adjust the timeline,
                then try again.
              </p>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Cloud render uses the slim Remotion worker bundled with this
              deployment and signed read URLs for your Supabase originals.
              The MP4 lives in Supabase Storage; Mux is playback only.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Final playback</CardTitle>
            <CardDescription>
              The latest completed export plays here once Mux returns a
              playback ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PlaybackPresetFilter
              activePresetId={activePresetId}
              onChange={setPlaybackPresetFilter}
              presets={presets}
              value={playbackPresetFilter}
            />
            {latestFilteredExport ? (
              <LatestExportPreview export={latestFilteredExport} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {finalExports.length > 0
                  ? "No export matches this preset filter yet."
                  : "No final export has been stored yet. Run the cloud render to produce one."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {filteredFinalExports.length > 1 ? (
        <ExportHistoryCard exports={filteredFinalExports} />
      ) : null}

      <SaveAsNewPresetDialog
        audioMediaAssetId={initialRemotionProps.audio?.mediaAssetId}
        newPresetName={newPresetName}
        onNameChange={setNewPresetName}
        onOpenChange={setSaveAsNewOpen}
        open={saveAsNewOpen}
        placementsJson={placementsJson}
        saveAsNewAction={saveAsNewAction}
        segmentsCount={segments.length}
        timelineStateJson={timelineStateJson}
        videoId={videoId}
      />

      <RenamePresetDialog
        activePresetId={activePresetId}
        onNameChange={setRenamePresetName}
        onOpenChange={setRenameOpen}
        open={renameOpen}
        presetName={renamePresetName}
        renameAction={renameAction}
        videoId={videoId}
      />
    </div>
  );
}

function HiddenAssemblyFields({
  audioMediaAssetId,
  placements,
  presetId,
  timelineState,
  videoId,
}: {
  audioMediaAssetId?: string | null;
  placements: string;
  presetId?: string | null;
  timelineState: string;
  videoId: string;
}) {
  return (
    <>
      <input name="videoId" type="hidden" value={videoId} />
      {presetId ? (
        <input name="presetId" type="hidden" value={presetId} />
      ) : null}
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

function AssemblyPresetToolbar({
  activePreset,
  activePresetId,
  deleteAction,
  deleteState,
  onRenameOpen,
  onSaveAsNewOpen,
  onSelectPreset,
  presets,
  videoId,
}: {
  activePreset?: AssemblyPreset;
  activePresetId: string | null;
  deleteAction: (
    state: AssemblyActionState,
    formData: FormData,
  ) => Promise<AssemblyActionState>;
  deleteState: AssemblyActionState;
  onRenameOpen: () => void;
  onSaveAsNewOpen: () => void;
  onSelectPreset: (presetId: string) => void;
  presets: AssemblyPreset[];
  videoId: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor="assembly-preset-select">Assembly preset</Label>
          <Select
            onValueChange={onSelectPreset}
            value={activePresetId ?? undefined}
          >
            <SelectTrigger className="w-full" id="assembly-preset-select">
              <SelectValue
                placeholder={
                  presets.length > 0 ? "Select preset" : "No presets yet"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" type="button" variant="outline">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Preset actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!activePresetId} onClick={onRenameOpen}>
              <Pencil className="h-4 w-4" />
              Rename preset
            </DropdownMenuItem>
            <DropdownMenuItem asChild disabled={!activePresetId || presets.length <= 1}>
              <form action={deleteAction}>
                <input name="videoId" type="hidden" value={videoId} />
                <input name="presetId" type="hidden" value={activePresetId ?? ""} />
                <button
                  className="flex w-full items-center gap-2 text-destructive"
                  disabled={!activePresetId || presets.length <= 1}
                  type="submit"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete preset
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {activePreset ? (
        <p className="text-xs text-muted-foreground">
          Editing <span className="font-medium text-foreground">{activePreset.name}</span>.
          Save overwrites this preset; cloud render uses it too.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          No preset saved yet. Save creates a &quot;Default&quot; preset, or use
          Save as new to pick a name.
        </p>
      )}
      <Button onClick={onSaveAsNewOpen} size="sm" type="button" variant="secondary">
        <Plus className="h-4 w-4" />
        Save as new preset…
      </Button>
      {deleteState.message ? (
        <p
          className={`text-xs ${deleteState.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {deleteState.message}
        </p>
      ) : null}
    </div>
  );
}

function PlaybackPresetFilter({
  activePresetId,
  onChange,
  presets,
  value,
}: {
  activePresetId: string | null;
  onChange: (value: string) => void;
  presets: AssemblyPreset[];
  value: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor="playback-preset-filter">Show exports for</Label>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full" id="playback-preset-filter">
          <SelectValue placeholder="Filter exports" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_PRESETS_FILTER}>All presets</SelectItem>
          {presets.map((preset) => (
            <SelectItem key={preset.id} value={preset.id}>
              {preset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {activePresetId && value === activePresetId ? (
        <p className="text-xs text-muted-foreground">
          Showing exports for the active editing preset.
        </p>
      ) : null}
    </div>
  );
}

function SaveAsNewPresetDialog({
  audioMediaAssetId,
  newPresetName,
  onNameChange,
  onOpenChange,
  open,
  placementsJson,
  saveAsNewAction,
  segmentsCount,
  timelineStateJson,
  videoId,
}: {
  audioMediaAssetId?: string | null;
  newPresetName: string;
  onNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  placementsJson: string;
  saveAsNewAction: (
    state: AssemblyActionState,
    formData: FormData,
  ) => Promise<AssemblyActionState>;
  segmentsCount: number;
  timelineStateJson: string;
  videoId: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as new preset</DialogTitle>
          <DialogDescription>
            Create a separate named preset with the current timeline and mix
            settings. Your existing presets stay unchanged.
          </DialogDescription>
        </DialogHeader>
        <form action={saveAsNewAction} className="space-y-4">
          <HiddenAssemblyFields
            audioMediaAssetId={audioMediaAssetId}
            placements={placementsJson}
            timelineState={timelineStateJson}
            videoId={videoId}
          />
          <div className="space-y-2">
            <Label htmlFor="presetName">Preset name</Label>
            <Input
              id="presetName"
              name="presetName"
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="e.g. Canvas / Spotify"
              required
              value={newPresetName}
            />
          </div>
          <DialogFooter>
            <SaveAsNewPresetButton disabled={segmentsCount === 0} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenamePresetDialog({
  activePresetId,
  onNameChange,
  onOpenChange,
  open,
  presetName,
  renameAction,
  videoId,
}: {
  activePresetId: string | null;
  onNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  presetName: string;
  renameAction: (
    state: AssemblyActionState,
    formData: FormData,
  ) => Promise<AssemblyActionState>;
  videoId: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename preset</DialogTitle>
          <DialogDescription>
            Rename the active assembly preset.
          </DialogDescription>
        </DialogHeader>
        {activePresetId ? (
          <form action={renameAction} className="space-y-4">
            <input name="videoId" type="hidden" value={videoId} />
            <input name="presetId" type="hidden" value={activePresetId} />
            <div className="space-y-2">
              <Label htmlFor="renamePresetName">Preset name</Label>
              <Input
                id="renamePresetName"
                name="presetName"
                onChange={(event) => onNameChange(event.target.value)}
                required
                value={presetName}
              />
            </div>
            <DialogFooter>
              <RenamePresetButton />
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
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

function RenderCloudButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} type="submit" variant="secondary">
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Film className="h-4 w-4" />
      )}
      Render in cloud (MP4)
    </Button>
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
      Save
    </Button>
  );
}

function SaveAsNewPresetButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} type="submit">
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
      Save as new preset
    </Button>
  );
}

function RenamePresetButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Rename
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
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

function DownloadLatestExportButton({
  latestExport,
  renderInFlight,
}: {
  latestExport: AssemblyFinalExport | null;
  renderInFlight: boolean;
}) {
  if (!latestExport) {
    return (
      <Button
        disabled
        title={
          renderInFlight
            ? "Render in progress — the button unlocks when the MP4 is ready."
            : "Run a cloud render first to produce a downloadable MP4."
        }
        type="button"
        variant="default"
      >
        <Download className="h-4 w-4" />
        Download MP4
      </Button>
    );
  }

  const filename =
    latestExport.asset.originalFilename ?? `assembly-${latestExport.asset.id}.mp4`;

  return (
    <Button asChild type="button" variant="default">
      <a
        download={filename}
        href={latestExport.downloadUrl}
        rel="noopener noreferrer"
      >
        <Download className="h-4 w-4" />
        Download MP4
      </a>
    </Button>
  );
}

function LatestExportPreview({ export: entry }: { export: AssemblyFinalExport }) {
  const { asset } = entry;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{asset.status}</Badge>
        <Badge variant="outline">latest</Badge>
        {entry.presetName ? (
          <Badge variant="outline">{entry.presetName}</Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">
          Rendered {formatExportDate(asset.createdAt)}
        </span>
      </div>
      {asset.muxPlaybackId ? (
        <RecipeMuxPlayer
          playbackId={asset.muxPlaybackId}
          title={asset.originalFilename ?? "Final export"}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Mux is still processing this export — playback will appear here
          once the playback id is ready. The download below is available
          immediately because it streams the Supabase MP4 directly.
        </p>
      )}
    </div>
  );
}

function ExportHistoryCard({
  exports,
}: {
  exports: AssemblyFinalExport[];
}) {
  // Skip the first entry — it is shown as "latest" in the export panel.
  const older = exports.slice(1);
  if (older.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="h-4 w-4" />
          Export history
        </CardTitle>
        <CardDescription>
          Every Supabase-stored MP4 export for this video. Click the icon to
          re-download an older render — useful for variants you sent to
          socials before tweaking the timeline.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border rounded-md border bg-muted/20">
          {older.map((entry) => {
            const { asset } = entry;
            const filename =
              asset.originalFilename ?? `assembly-${asset.id}.mp4`;
            return (
              <li
                className="flex items-center justify-between gap-3 px-3 py-2"
                key={asset.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{filename}</p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {entry.presetName ? (
                      <Badge variant="outline">{entry.presetName}</Badge>
                    ) : null}
                    <span>
                      Rendered {formatExportDate(asset.createdAt)}
                      {asset.fileSizeBytes != null ? (
                        <> · {formatBytes(asset.fileSizeBytes)}</>
                      ) : null}
                    </span>
                  </p>
                </div>
                <Button
                  asChild
                  size="sm"
                  title={`Download ${filename}`}
                  variant="outline"
                >
                  <a
                    download={filename}
                    href={entry.downloadUrl}
                    rel="noopener noreferrer"
                  >
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download</span>
                  </a>
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function formatExportDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let v = value / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && v >= 1024; i++) {
    v /= 1024;
    unit = units[i];
  }
  return `${v.toFixed(1)} ${unit}`;
}

function EmptyPreview() {
  return (
    <div className="flex aspect-[9/16] max-h-[720px] items-center justify-center rounded-xl border bg-muted text-center text-sm text-muted-foreground">
      No accepted Supabase-stored clips are available for Remotion preview yet.
    </div>
  );
}
