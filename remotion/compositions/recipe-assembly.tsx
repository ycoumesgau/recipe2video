import {
  AbsoluteFill,
  Audio,
  Sequence,
  Video,
  useCurrentFrame,
} from "remotion";

import type { AssemblyRemotionProps } from "@/modules/assembly/assembly.types";

export function RecipeAssemblyComposition({
  audio,
  audioSync,
  fps,
  segments,
}: AssemblyRemotionProps) {
  const segmentFrames = segments.map((segment) =>
    secondsToFrames(segment.durationSeconds, fps),
  );
  const { segmentStarts, totalDurationFrames } = segmentFrames.reduce<{
    segmentStarts: number[];
    totalDurationFrames: number;
  }>(
    (timeline, frames) => ({
      segmentStarts: [
        ...timeline.segmentStarts,
        timeline.totalDurationFrames,
      ],
      totalDurationFrames: timeline.totalDurationFrames + frames,
    }),
    { segmentStarts: [], totalDurationFrames: 0 },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {segments.map((segment, index) => {
        const from = segmentStarts[index] ?? 0;
        const durationInFrames = segmentFrames[index] ?? fps * 5;

        return (
          <Sequence
            durationInFrames={durationInFrames}
            from={from}
            key={`${segment.segmentId}-${segment.mediaAssetId}`}
          >
            <Video
              muted
              src={segment.sourceUrl}
              style={{
                height: "100%",
                objectFit: "cover",
                width: "100%",
              }}
            />
            <SegmentTitle title={segment.title} />
          </Sequence>
        );
      })}

      {audio ? (
        <AssemblyAudio
          audioSync={audioSync}
          fps={fps}
          sourceUrl={audio.sourceUrl}
          totalDurationFrames={totalDurationFrames}
        />
      ) : null}
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

function AssemblyAudio({
  audioSync,
  fps,
  sourceUrl,
  totalDurationFrames,
}: {
  audioSync: AssemblyRemotionProps["audioSync"];
  fps: number;
  sourceUrl: string;
  totalDurationFrames: number;
}) {
  const frame = useCurrentFrame();
  const offsetFrames = secondsToFrames(audioSync.offsetSeconds, fps);
  const fadeInFrames = secondsToFrames(audioSync.fadeInSeconds, fps);
  const fadeOutFrames = secondsToFrames(audioSync.fadeOutSeconds, fps);
  const audioStartsAt = Math.max(offsetFrames, 0);
  const startFrom = Math.max(
    secondsToFrames(audioSync.cutFromSeconds, fps) - Math.min(offsetFrames, 0),
    0,
  );
  const audioFrame = frame - audioStartsAt;
  const fadeInVolume =
    fadeInFrames > 0 ? clamp(audioFrame / fadeInFrames, 0, 1) : 1;
  const framesUntilEnd = totalDurationFrames - frame;
  const fadeOutVolume =
    fadeOutFrames > 0 ? clamp(framesUntilEnd / fadeOutFrames, 0, 1) : 1;

  return (
    <Sequence from={audioStartsAt}>
      <Audio
        src={sourceUrl}
        startFrom={startFrom}
        volume={Math.min(fadeInVolume, fadeOutVolume)}
      />
    </Sequence>
  );
}

export function getAssemblyDurationInFrames(
  props: Pick<AssemblyRemotionProps, "fps" | "segments">,
) {
  return Math.max(
    props.segments.reduce(
      (total, segment) =>
        total + secondsToFrames(segment.durationSeconds, props.fps),
      0,
    ),
    props.fps,
  );
}

function secondsToFrames(seconds: number, fps: number) {
  return Math.max(Math.round(seconds * fps), 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
