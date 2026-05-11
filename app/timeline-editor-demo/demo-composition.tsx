"use client";

import { AbsoluteFill, Audio, Sequence, useCurrentFrame } from "remotion";

import type {
  AssemblyAudioClip,
  AssemblyAudioTrack,
  AssemblySegmentClip,
} from "@/modules/assembly/assembly.types";

const SEGMENT_PALETTE = [
  ["#1e3a8a", "#3b82f6"],
  ["#7c2d12", "#f97316"],
  ["#14532d", "#22c55e"],
  ["#581c87", "#a855f7"],
  ["#0f172a", "#475569"],
];

/**
 * Demo-only composition that mirrors the production composition's timing
 * primitives ({@link Sequence}, {@link Audio}) but uses solid-color frames
 * instead of cross-origin {@link Video} sources. Playback therefore works in
 * any browser (including the test runner's headless Chrome) without depending
 * on the codec / CORS posture of an external CDN.
 *
 * The real production composition lives in {@link RecipeAssemblyComposition}
 * and continues to use Supabase signed URLs.
 */
export function TimelineDemoComposition({
  audio,
  audioClips,
  fps,
  segments,
}: {
  audio?: AssemblyAudioTrack | null;
  audioClips: AssemblyAudioClip[];
  fps: number;
  segments: AssemblySegmentClip[];
}) {
  const layouts: Array<{ durationFrames: number; fromFrames: number }> = [];
  let cursor = 0;
  for (const segment of segments) {
    const trimmed = Math.max(segment.outSeconds - segment.inSeconds, 0);
    const durationFrames = Math.max(Math.round(trimmed * fps), 1);
    layouts.push({ durationFrames, fromFrames: cursor });
    cursor += durationFrames;
  }
  const totalSegmentFrames = layouts.reduce(
    (acc, layout) => acc + layout.durationFrames,
    0,
  );
  const totalAudioFrames = audioClips.reduce((max, clip) => {
    const start = Math.round(clip.startOnTimelineSeconds * fps);
    const trimmed = Math.max(clip.outSeconds - clip.inSeconds, 0);
    return Math.max(max, start + Math.max(Math.round(trimmed * fps), 1));
  }, 0);
  const totalDuration = Math.max(totalSegmentFrames, totalAudioFrames, fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0f172a" }}>
      {segments.map((segment, index) => {
        const layout = layouts[index];
        if (!layout) {
          return null;
        }
        const [from, to] =
          SEGMENT_PALETTE[index % SEGMENT_PALETTE.length] ?? [
            "#1e3a8a",
            "#3b82f6",
          ];
        return (
          <Sequence
            durationInFrames={layout.durationFrames}
            from={layout.fromFrames}
            key={segment.segmentId}
          >
            <ColorFrame title={segment.title} fromColor={from} toColor={to} />
          </Sequence>
        );
      })}
      {audio
        ? audioClips.map((clip) => {
            const start = Math.round(clip.startOnTimelineSeconds * fps);
            const trimmed = Math.max(clip.outSeconds - clip.inSeconds, 0);
            const durationFrames = Math.min(
              Math.max(Math.round(trimmed * fps), 1),
              Math.max(totalDuration - start, 1),
            );
            return (
              <Sequence
                durationInFrames={durationFrames}
                from={start}
                key={clip.id}
              >
                <Audio
                  src={audio.sourceUrl}
                  startFrom={Math.round(clip.inSeconds * fps)}
                  volume={Math.max(Math.min(clip.volume, 2), 0)}
                />
              </Sequence>
            );
          })
        : null}
    </AbsoluteFill>
  );
}

function ColorFrame({
  fromColor,
  title,
  toColor,
}: {
  fromColor: string;
  title: string;
  toColor: string;
}) {
  const frame = useCurrentFrame();
  const pulse = (Math.sin(frame / 8) + 1) / 2;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${fromColor}, ${toColor})`,
      }}
    >
      <div
        style={{
          alignItems: "center",
          color: "white",
          display: "flex",
          fontFamily: "Inter, sans-serif",
          fontSize: 84,
          fontWeight: 800,
          height: "100%",
          justifyContent: "center",
          letterSpacing: -2,
          textShadow: "0 6px 24px rgba(0,0,0,0.45)",
          width: "100%",
        }}
      >
        {title}
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.25)",
          borderRadius: 999,
          bottom: 60,
          height: 12,
          left: "50%",
          position: "absolute",
          transform: `translate(-50%, 0) scaleX(${0.4 + pulse * 0.6})`,
          width: 200,
        }}
      />
      <div
        style={{
          bottom: 16,
          color: "rgba(255,255,255,0.7)",
          fontFamily: "Inter, sans-serif",
          fontSize: 18,
          left: 0,
          position: "absolute",
          textAlign: "center",
          width: "100%",
        }}
      >
        frame {frame}
      </div>
    </AbsoluteFill>
  );
}

export function getDemoDurationInFrames({
  audioClips,
  fps,
  segments,
}: {
  audioClips: AssemblyAudioClip[];
  fps: number;
  segments: AssemblySegmentClip[];
}) {
  let cursor = 0;
  for (const segment of segments) {
    const trimmed = Math.max(segment.outSeconds - segment.inSeconds, 0);
    cursor += Math.max(Math.round(trimmed * fps), 1);
  }
  const audioEnd = audioClips.reduce((max, clip) => {
    const start = Math.round(clip.startOnTimelineSeconds * fps);
    const trimmed = Math.max(clip.outSeconds - clip.inSeconds, 0);
    return Math.max(max, start + Math.max(Math.round(trimmed * fps), 1));
  }, 0);
  return Math.max(cursor, audioEnd, fps);
}
