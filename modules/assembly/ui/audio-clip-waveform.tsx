"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Renders the full source waveform for an audio clip and visually clips it to
 * the trimmed [inSeconds, outSeconds] window. The parent container handles
 * `overflow-hidden`; we translate the waveform horizontally so only the
 * trimmed portion is visible at the right horizontal scale.
 *
 * Wavesurfer.js is loaded lazily on the client only so it does not bloat the
 * initial bundle. If the audio cannot decode (CORS, unsupported codec) we
 * fall back to a flat horizontal strip so the clip still renders.
 */
export function AudioClipWaveform({
  className,
  durationSeconds,
  inSeconds,
  outSeconds,
  pxPerSecond,
  sourceUrl,
}: {
  className?: string;
  durationSeconds: number;
  inSeconds: number;
  outSeconds: number;
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

        instance = WaveSurfer.create({
          backend: "WebAudio",
          barGap: 1,
          barRadius: 1,
          barWidth: 2,
          container: containerRef.current,
          cursorWidth: 0,
          height: 56,
          interact: false,
          normalize: true,
          progressColor: "rgba(244, 63, 101, 0.65)",
          url: sourceUrl,
          waveColor: "rgba(244, 63, 101, 0.9)",
        });
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
  }, [sourceUrl]);

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
