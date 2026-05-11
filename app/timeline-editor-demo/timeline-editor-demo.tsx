"use client";

import { useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";

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
import { generateSyntheticPeaks } from "@/modules/assembly/ui/audio-clip-waveform";
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
    title: "Hook",
    position: 0,
    durationSeconds: 8,
    inSeconds: 0,
    outSeconds: 8,
    sourceUrl: "demo://hook",
    storageBucket: "demo",
    storagePath: "demo/1.mp4",
  },
  {
    placementId: "demo-place-2",
    segmentId: "demo-seg-2",
    mediaAssetId: "demo-asset-2",
    title: "Beat",
    position: 1,
    durationSeconds: 8,
    inSeconds: 0,
    outSeconds: 8,
    sourceUrl: "demo://beat",
    storageBucket: "demo",
    storagePath: "demo/2.mp4",
  },
  {
    placementId: "demo-place-3",
    segmentId: "demo-seg-3",
    mediaAssetId: "demo-asset-3",
    title: "Payoff",
    position: 2,
    durationSeconds: 8,
    inSeconds: 0,
    outSeconds: 8,
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

  const remotionProps = useMemo(
    () => ({
      fps: 30,
      width: 720,
      height: 1280,
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

        <Card>
          <CardHeader>
            <CardTitle>Live state</CardTitle>
            <CardDescription>
              What the timeline editor would persist on save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[420px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
              {JSON.stringify(
                {
                  placements: segments.map((s) => ({
                    placementId: s.placementId,
                    segmentId: s.segmentId,
                    inSeconds: s.inSeconds,
                    outSeconds: s.outSeconds,
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

      <Card>
        <CardHeader>
          <CardTitle>Timeline editor</CardTitle>
          <CardDescription>
            Drag bodies to move/reorder, drag clip edges to trim, drag the
            audio corners to fade. The trim/move/fade preview ghost commits
            on release. Press <kbd>Space</kbd> to play/pause, <kbd>S</kbd> to
            split, <kbd>Del</kbd> to remove.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimelineEditor
            audioClips={audioClips}
            audioTrack={INITIAL_AUDIO_TRACK}
            fps={remotionProps.fps}
            onAudioClipsChange={setAudioClips}
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
