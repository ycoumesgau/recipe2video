"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Renders the source waveform for an audio clip and visually clips it to the
 * trimmed `[inSeconds, outSeconds]` window. The parent container handles
 * `overflow-hidden`; we translate the waveform horizontally so only the
 * trimmed portion is visible at the right horizontal scale.
 *
 * Wavesurfer.js is loaded lazily on the client only so it does not bloat the
 * initial bundle. Two paths are supported:
 *
 *   - Pre-computed `peaks`: the parent passes a normalized `Float32Array` (or
 *     `number[]`). Wavesurfer renders directly from it without any network
 *     request. Used by the demo route and by the production page when peaks
 *     have already been extracted server-side.
 *   - URL-only: wavesurfer fetches `sourceUrl`. Requires the audio response
 *     to expose CORS headers so peaks can be decoded for visualisation. This
 *     is the production path with Supabase signed URLs.
 *
 * If neither path can produce peaks, we fall back to a static "waveform
 * unavailable" strip so the clip still renders.
 */
export function AudioClipWaveform({
  className,
  durationSeconds,
  inSeconds,
  outSeconds,
  peaks,
  pxPerSecond,
  sourceUrl,
}: {
  className?: string;
  durationSeconds: number;
  inSeconds: number;
  outSeconds: number;
  peaks?: number[] | Float32Array;
  pxPerSecond: number;
  sourceUrl: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const safeDuration = Math.max(durationSeconds, outSeconds, 0.1);
  const fullWidth = Math.max(safeDuration * pxPerSecond, 1);
  const offsetX = -inSeconds * pxPerSecond;

  useEffect(() => {
    let disposed = false;
    let instance: { destroy?: () => void } | null = null;

    async function mount() {
      if (!containerRef.current) {
        return;
      }

      try {
        const { default: WaveSurfer } = await import("wavesurfer.js");

        if (disposed || !containerRef.current) {
          return;
        }

        const baseOptions = {
          // The default MediaElement backend renders the waveform from an
          // HTML <audio> element. Switching to WebAudio would require
          // Access-Control-Allow-Origin on the audio response, which we
          // cannot guarantee for arbitrary signed URLs.
          backend: "MediaElement" as const,
          barGap: 1,
          barRadius: 1,
          barWidth: 2,
          container: containerRef.current,
          cursorWidth: 0,
          height: 56,
          interact: false,
          normalize: true,
          progressColor: "rgba(244, 63, 101, 0.65)",
          waveColor: "rgba(244, 63, 101, 0.9)",
        };

        if (peaks && peaks.length > 0) {
          // Pre-computed peaks path: no network needed.
          instance = WaveSurfer.create({
            ...baseOptions,
            duration: safeDuration,
            peaks: [Array.from(peaks)],
          });
        } else {
          instance = WaveSurfer.create({
            ...baseOptions,
            url: sourceUrl,
          });
        }
        wavesurferRef.current = instance;
      } catch (caught) {
        if (!disposed) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to render the audio waveform.",
          );
        }
      }
    }

    void mount();

    return () => {
      disposed = true;
      try {
        instance?.destroy?.();
      } catch {
        // Wavesurfer can throw if AudioContext was already closed; ignore.
      }
      wavesurferRef.current = null;
    };
    // We intentionally re-create the wavesurfer instance only when the audio
    // source itself changes; trim/zoom changes are handled via parent CSS.
  }, [peaks, safeDuration, sourceUrl]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      {error ? (
        <div className="flex h-full w-full items-center justify-center bg-rose-950/30 text-[10px] text-rose-200">
          waveform unavailable
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{
            height: "100%",
            transform: `translateX(${offsetX}px)`,
            width: fullWidth,
          }}
        />
      )}
    </div>
  );
}

/**
 * Generate a deterministic, non-flat sequence of peaks suitable for demos.
 * Sums two slow sinusoids with a small noise term, then normalises to [-1, 1].
 */
export function generateSyntheticPeaks(
  sampleCount: number,
  seed = 42,
): Float32Array {
  const peaks = new Float32Array(sampleCount);
  let state = seed;
  for (let i = 0; i < sampleCount; i += 1) {
    // Lightweight LCG for determinism.
    state = (state * 1664525 + 1013904223) % 4294967296;
    const noise = (state / 4294967296 - 0.5) * 0.2;
    const slow = Math.sin((i / sampleCount) * Math.PI * 6);
    const fast = Math.cos((i / sampleCount) * Math.PI * 24) * 0.5;
    peaks[i] = (slow * 0.7 + fast + noise) * 0.85;
  }
  return peaks;
}
