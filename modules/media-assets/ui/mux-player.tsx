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
  const frameClassName = cn(
    "aspect-video w-full overflow-hidden rounded-lg border bg-black",
    className,
  );

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
