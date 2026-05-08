"use client";

import MuxPlayer from "@mux/mux-player-react";

import { cn } from "@/lib/utils";

export function RecipeMuxPlayer({
  className,
  playbackId,
  title,
}: {
  className?: string;
  playbackId?: string | null;
  title?: string;
}) {
  if (!playbackId) {
    return (
      <div
        className={cn(
          "flex aspect-video items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground",
          className,
        )}
      >
        No Mux playback ID available.
      </div>
    );
  }

  return (
    <MuxPlayer
      accentColor="#f59e0b"
      className={cn("aspect-video w-full overflow-hidden rounded-lg", className)}
      metadata={{
        video_title: title ?? "Recipe2Video media asset",
      }}
      playbackId={playbackId}
      streamType="on-demand"
    />
  );
}
