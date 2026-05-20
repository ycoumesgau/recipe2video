"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";

import {
  ASSEMBLY_CANVAS_HEIGHT,
  ASSEMBLY_CANVAS_WIDTH,
} from "@/modules/assembly/assembly.constants";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  AssemblyAudioClip,
  AssemblyAudioTrack,
  AssemblySegmentClip,
} from "@/modules/assembly/assembly.types";
import { generatePlacementId } from "@/modules/assembly/timeline-state";
import { generateSyntheticPeaks } from "@/modules/assembly/ui/audio-clip-waveform";
import { VideoClipMixSection } from "@/modules/assembly/ui/audio-mix-panel";
import { SegmentBin } from "@/modules/assembly/ui/segment-bin";
import { TimelineEditor } from "@/modules/assembly/ui/timeline-editor";

import {
  getDemoDurationInFrames,
  TimelineDemoComposition,
} from "./demo-composition";

const INITIAL_SEGMENTS: AssemblySegmentClip[] = [
  {
    placementId: "demo-place-1",
    segmentId: "demo-seg-1",
    mediaAssetId: "demo-asset-1",
    title: "S1. Hook",
    position: 0,
    durationSeconds: 8,
    inSeconds: 0,
    outSeconds: 8,
    volume: 1,
    playbackRate: 1,
    sourceUrl: "demo://hook",
    storageBucket: "demo",
    storagePath: "demo/1.mp4",
  },
  {
    placementId: "demo-place-2",
    segmentId: "demo-seg-2",
    mediaAssetId: "demo-asset-2",
    title: "S2. Beat",
    position: 1,
    durationSeconds: 8,
    inSeconds: 0,
    outSeconds: 8,
    volume: 1,
    playbackRate: 1,
    sourceUrl: "demo://beat",
    storageBucket: "demo",
    storagePath: "demo/2.mp4",
  },
  {
    placementId: "demo-place-3",
    segmentId: "demo-seg-3",
    mediaAssetId: "demo-asset-3",
    title: "S3. Payoff",
    position: 2,
    durationSeconds: 8,
    inSeconds: 0,
    outSeconds: 8,
    volume: 1,
    playbackRate: 1,
    sourceUrl: "demo://payoff",
    storageBucket: "demo",
    storagePath: "demo/3.mp4",
  },
];

// Public-domain MP3 hosted by Wikimedia Commons. Used here purely so the
// audio waveform demo has something to decode; in production the source is
// always a Supabase signed URL on a Suno upload.
const SAMPLE_AUDIO =
  "https://upload.wikimedia.org/wikipedia/commons/8/8c/Ave_Maria_-_Schubert.ogg";

const INITIAL_AUDIO_TRACK: AssemblyAudioTrack = {
  mediaAssetId: "demo-audio-1",
  title: "Demo soundtrack",
  sourceUrl: SAMPLE_AUDIO,
  durationSeconds: 60,
};

const INITIAL_AUDIO_CLIPS: AssemblyAudioClip[] = [
  {
    id: "demo-clip-1",
    mediaAssetId: INITIAL_AUDIO_TRACK.mediaAssetId,
    startOnTimelineSeconds: 0,
    inSeconds: 0,
    outSeconds: 30,
    volume: 1,
    fadeInSeconds: 1,
    fadeOutSeconds: 2,
  },
];

const DEMO_PEAKS = generateSyntheticPeaks(1024);

/**
 * The catalogue of "available segments" the bin renders. In the production
 * page this comes from `getAssemblyPageData`, here we expose the same three
 * demo clips so a card from the bin can be dropped onto the video lane.
 */
const DEMO_AVAILABLE_SEGMENTS: AssemblySegmentClip[] = INITIAL_SEGMENTS.map(
  (segment) => ({ ...segment }),
);

export function TimelineEditorDemo() {
  const [segments, setSegments] =
    useState<AssemblySegmentClip[]>(INITIAL_SEGMENTS);
  const [audioClips, setAudioClips] =
    useState<AssemblyAudioClip[]>(INITIAL_AUDIO_CLIPS);
  const playerRef = useRef<PlayerRef | null>(null);
  const peaksByMediaAsset = useMemo(
    () => ({ [INITIAL_AUDIO_TRACK.mediaAssetId]: DEMO_PEAKS }),
    [],
  );
  const handleAddSegmentFromBin = useCallback(
    (segmentId: string, insertIndex: number) => {
      const catalogueEntry = DEMO_AVAILABLE_SEGMENTS.find(
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
          playbackRate: 1,
        };
        return [
          ...current.slice(0, safeIndex),
          newClip,
          ...current.slice(safeIndex),
        ];
      });
    },
    [],
  );
  const handleSegmentDroppedFromBin = useCallback(
    ({ segmentId, insertIndex }: { segmentId: string; insertIndex: number }) =>
      handleAddSegmentFromBin(segmentId, insertIndex),
    [handleAddSegmentFromBin],
  );
  const handleAppendSegmentFromBin = useCallback(
    (segmentId: string) =>
      handleAddSegmentFromBin(segmentId, Number.MAX_SAFE_INTEGER),
    [handleAddSegmentFromBin],
  );

  const remotionProps = useMemo(
    () => ({
      fps: 30,
      width: ASSEMBLY_CANVAS_WIDTH,
      height: ASSEMBLY_CANVAS_HEIGHT,
      segments,
      audio: INITIAL_AUDIO_TRACK,
      audioClips,
    }),
    [audioClips, segments],
  );
  const durationInFrames = getDemoDurationInFrames({
    audioClips,
    fps: remotionProps.fps,
    segments,
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.4fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Remotion preview</CardTitle>
            <CardDescription>
              Driven live by the timeline state below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border bg-black">
              <Player
                acknowledgeRemotionLicense
                component={TimelineDemoComposition}
                compositionHeight={remotionProps.height}
                compositionWidth={remotionProps.width}
                controls
                durationInFrames={durationInFrames}
                fps={remotionProps.fps}
                inputProps={remotionProps}
                ref={playerRef}
                style={{
                  aspectRatio: `${remotionProps.width} / ${remotionProps.height}`,
                  maxHeight: 480,
                  width: "100%",
                }}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Volume &amp; speed</CardTitle>
              <CardDescription>
                Per clip: audio level (left) and playback speed (right). Split
                a clip on the timeline to adjust each piece independently.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VideoClipMixSection
                onChange={setSegments}
                segments={segments}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Live state</CardTitle>
              <CardDescription>
                What the timeline editor would persist on save.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[260px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
                {JSON.stringify(
                  {
                    placements: segments.map((s) => ({
                      placementId: s.placementId,
                      segmentId: s.segmentId,
                      inSeconds: s.inSeconds,
                      outSeconds: s.outSeconds,
                      volume: s.volume,
                      playbackRate: s.playbackRate,
                    })),
                    audioClips,
                  },
                  null,
                  2,
                )}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timeline editor</CardTitle>
          <CardDescription>
            Drag bodies to move/reorder, drag clip edges to trim, drag the
            audio corners to fade. The trim/move/fade preview ghost commits
            on release. Drag a card from the bin onto the video lane to add
            a placement; press <kbd>Space</kbd> to play/pause, <kbd>S</kbd>
            to split a selected clip at the playhead, <kbd>Del</kbd> to
            remove it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SegmentBin
            availableSegments={DEMO_AVAILABLE_SEGMENTS}
            onAppend={handleAppendSegmentFromBin}
          />
          <TimelineEditor
            audioClips={audioClips}
            audioTrack={INITIAL_AUDIO_TRACK}
            fps={remotionProps.fps}
            onAudioClipsChange={setAudioClips}
            onSegmentDroppedFromBin={handleSegmentDroppedFromBin}
            onSegmentsChange={setSegments}
            peaksByMediaAsset={peaksByMediaAsset}
            playerRef={playerRef}
            segments={segments}
          />
        </CardContent>
      </Card>
    </div>
  );
}
