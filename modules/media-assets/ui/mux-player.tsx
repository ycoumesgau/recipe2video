"use client";

import MuxPlayer from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";
import { useCallback, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { setupPreciseMuxTimeDisplaysWhenReady } from "./mux-player-precise-time";

export function RecipeMuxPlayer({
  className,
  playbackId,
  title,
}: {
  className?: string;
  playbackId?: string | null;
  title?: string;
}) {
  const frameClassName = cn(
    "aspect-video w-full overflow-hidden rounded-lg border bg-black",
    className,
  );
  const cleanupRef = useRef<(() => void) | null>(null);

  const detachPreciseTimeDisplays = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  const attachPreciseTimeDisplays = useCallback(
    (player: MuxPlayerElement | null) => {
      detachPreciseTimeDisplays();
      if (!player) {
        return;
      }

      cleanupRef.current = setupPreciseMuxTimeDisplaysWhenReady(player);
    },
    [detachPreciseTimeDisplays],
  );

  const handlePlayerRef = useCallback(
    (player: MuxPlayerElement | null) => {
      attachPreciseTimeDisplays(player);
    },
    [attachPreciseTimeDisplays],
  );

  useEffect(() => {
    return detachPreciseTimeDisplays;
  }, [detachPreciseTimeDisplays, playbackId]);

  if (!playbackId) {
    return (
      <div
        className={cn(
          frameClassName,
          "flex items-center justify-center bg-muted text-sm text-muted-foreground",
        )}
      >
        No Mux playback ID available.
      </div>
    );
  }

  return (
    <div className={frameClassName}>
      <MuxPlayer
        ref={handlePlayerRef}
        accentColor="#f59e0b"
        className="h-full w-full [--media-object-fit:contain]"
        metadata={{
          video_title: title ?? "Recipe2Video media asset",
        }}
        playbackId={playbackId}
        streamType="on-demand"
      />
    </div>
  );
}
