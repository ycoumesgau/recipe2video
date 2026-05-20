import {
  AbsoluteFill,
  Audio,
  Sequence,
  Video,
  useCurrentFrame,
} from "remotion";

import type {
  AssemblyAudioClip,
  AssemblyAudioTrack,
  AssemblyRemotionProps,
  AssemblySegmentClip,
} from "@/modules/assembly/assembly.types";

export function RecipeAssemblyComposition({
  audio,
  audioClips,
  fps,
  segments,
  showSegmentTitles = true,
}: AssemblyRemotionProps) {
  const segmentTimeline = computeSegmentTimeline(segments, fps);
  const totalDurationFrames = computeTotalDurationFrames({
    segmentTimeline,
    audioClips,
    fps,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {segments.map((segment, index) => {
        const layout = segmentTimeline[index];
        if (!layout) {
          return null;
        }

        return (
          <Sequence
            durationInFrames={layout.durationFrames}
            from={layout.fromFrames}
            key={segment.placementId}
          >
            <Video
              endAt={secondsToFrames(segment.outSeconds, fps)}
              src={segment.sourceUrl}
              startFrom={secondsToFrames(segment.inSeconds, fps)}
              style={{
                height: "100%",
                objectFit: "cover",
                width: "100%",
              }}
              volume={clamp(segment.volume ?? 1, 0, 2)}
            />
            {showSegmentTitles ? (
              <SegmentTitle title={segment.title} />
            ) : null}
          </Sequence>
        );
      })}

      {audio
        ? audioClips.map((clip) => (
            <AssemblyAudioRender
              audio={audio}
              clip={clip}
              fps={fps}
              key={clip.id}
              totalDurationFrames={totalDurationFrames}
            />
          ))
        : null}
    </AbsoluteFill>
  );
}

function SegmentTitle({ title }: { title: string }) {
  return (
    <div
      style={{
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.58), rgba(0,0,0,0))",
        color: "white",
        fontFamily: "Inter, sans-serif",
        fontSize: 34,
        fontWeight: 700,
        left: 0,
        letterSpacing: -0.3,
        padding: "36px 40px",
        position: "absolute",
        right: 0,
        textShadow: "0 2px 16px rgba(0,0,0,0.45)",
        top: 0,
      }}
    >
      {title}
    </div>
  );
}

function AssemblyAudioRender({
  audio,
  clip,
  fps,
  totalDurationFrames,
}: {
  audio: AssemblyAudioTrack;
  clip: AssemblyAudioClip;
  fps: number;
  totalDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const startFrame = Math.max(
    secondsToFrames(clip.startOnTimelineSeconds, fps),
    0,
  );
  const inFrames = secondsToFrames(clip.inSeconds, fps);
  const outFrames = secondsToFrames(clip.outSeconds, fps);
  const audioDurationFrames = Math.max(outFrames - inFrames, 1);
  const remainingFrames = Math.max(totalDurationFrames - startFrame, 1);
  const durationFrames = Math.min(audioDurationFrames, remainingFrames);
  const fadeInFrames = secondsToFrames(clip.fadeInSeconds, fps);
  const fadeOutFrames = secondsToFrames(clip.fadeOutSeconds, fps);
  const localFrame = frame - startFrame;
  const fadeInVolume =
    fadeInFrames > 0 ? clamp(localFrame / fadeInFrames, 0, 1) : 1;
  const framesUntilEnd = durationFrames - localFrame;
  const fadeOutVolume =
    fadeOutFrames > 0 ? clamp(framesUntilEnd / fadeOutFrames, 0, 1) : 1;
  const baseVolume = clamp(clip.volume, 0, 2);

  return (
    <Sequence durationInFrames={durationFrames} from={startFrame}>
      <Audio
        src={audio.sourceUrl}
        startFrom={inFrames}
        volume={baseVolume * Math.min(fadeInVolume, fadeOutVolume)}
      />
    </Sequence>
  );
}

interface SegmentLayout {
  fromFrames: number;
  durationFrames: number;
}

function computeSegmentTimeline(
  segments: AssemblySegmentClip[],
  fps: number,
): SegmentLayout[] {
  let cursor = 0;
  return segments.map((segment) => {
    const trimmed = Math.max(segment.outSeconds - segment.inSeconds, 0);
    const durationFrames = Math.max(secondsToFrames(trimmed, fps), 1);
    const fromFrames = cursor;
    cursor += durationFrames;
    return { fromFrames, durationFrames };
  });
}

function computeTotalDurationFrames({
  segmentTimeline,
  audioClips,
  fps,
}: {
  segmentTimeline: SegmentLayout[];
  audioClips: AssemblyAudioClip[];
  fps: number;
}) {
  const lastSegment = segmentTimeline[segmentTimeline.length - 1];
  const segmentEnd = lastSegment
    ? lastSegment.fromFrames + lastSegment.durationFrames
    : 0;
  const audioEnd = audioClips.reduce((max, clip) => {
    const start = secondsToFrames(clip.startOnTimelineSeconds, fps);
    const trimmed = Math.max(clip.outSeconds - clip.inSeconds, 0);
    return Math.max(max, start + secondsToFrames(trimmed, fps));
  }, 0);
  return Math.max(segmentEnd, audioEnd, fps);
}

export function getAssemblyDurationInFrames(
  props: Pick<AssemblyRemotionProps, "fps" | "segments" | "audioClips">,
) {
  const segmentTimeline = computeSegmentTimeline(props.segments, props.fps);
  return computeTotalDurationFrames({
    segmentTimeline,
    audioClips: props.audioClips,
    fps: props.fps,
  });
}

function secondsToFrames(seconds: number, fps: number) {
  return Math.max(Math.round(seconds * fps), 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
