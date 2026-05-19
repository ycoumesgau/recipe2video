"use client";

import MuxPlayer from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import {
  formatVideoReviewTime,
  formatVideoReviewTimeRange,
} from "./format-video-review-time";

function patchTimeDisplaySlot(
  display: Element,
  currentSeconds: number,
  totalSeconds: number,
) {
  const slot = display.shadowRoot?.querySelector("slot");
  if (!slot) {
    return;
  }

  const remaining = display.hasAttribute("remaining");
  const showDuration = display.hasAttribute("showduration");
  const displaySeconds = remaining
    ? Math.max(0, totalSeconds - currentSeconds)
    : currentSeconds;

  const label = showDuration
    ? formatVideoReviewTimeRange(displaySeconds, totalSeconds)
    : formatVideoReviewTime(displaySeconds);

  if (slot.innerHTML !== label) {
    slot.innerHTML = label;
  }
}

function patchPreviewTimeDisplay(display: Element) {
  const previewTime = display.getAttribute("mediapreviewtime");
  if (previewTime == null) {
    return;
  }

  const slot = display.shadowRoot?.querySelector("slot");
  if (!slot) {
    return;
  }

  const label = formatVideoReviewTime(parseFloat(previewTime));
  if (slot.textContent !== label) {
    slot.textContent = label;
  }
}

function setupPreciseMuxTimeDisplays(player: MuxPlayerElement) {
  const root = player.shadowRoot;
  if (!root) {
    return () => {};
  }

  let disposed = false;
  const observers: MutationObserver[] = [];

  const getDisplays = () => ({
    timeDisplay: root.querySelector("media-time-display"),
    previewDisplay: root.querySelector("media-preview-time-display"),
  });

  const sync = () => {
    if (disposed) {
      return;
    }

    const duration = Number.isFinite(player.duration) ? player.duration : 0;
    const currentTime = Number.isFinite(player.currentTime)
      ? player.currentTime
      : 0;
    const { timeDisplay, previewDisplay } = getDisplays();

    if (timeDisplay) {
      patchTimeDisplaySlot(timeDisplay, currentTime, duration);
    }

    if (previewDisplay) {
      patchPreviewTimeDisplay(previewDisplay);
    }
  };

  const watchDisplay = (
    display: Element,
    options: MutationObserverInit,
  ) => {
    const observer = new MutationObserver(sync);
    observer.observe(display, options);
    observers.push(observer);
  };

  const attachObservers = () => {
    const { timeDisplay, previewDisplay } = getDisplays();

    if (timeDisplay) {
      const slot = timeDisplay.shadowRoot?.querySelector("slot");
      if (slot) {
        watchDisplay(slot, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }

      watchDisplay(timeDisplay, {
        attributes: true,
        attributeFilter: ["remaining", "mediacurrenttime", "mediaduration"],
      });
    }

    if (previewDisplay) {
      watchDisplay(previewDisplay, {
        attributes: true,
        attributeFilter: ["mediapreviewtime"],
      });

      const slot = previewDisplay.shadowRoot?.querySelector("slot");
      if (slot) {
        watchDisplay(slot, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    }
  };

  const mediaEvents = [
    "timeupdate",
    "durationchange",
    "loadedmetadata",
    "seeking",
    "seeked",
  ] as const;

  for (const eventName of mediaEvents) {
    player.addEventListener(eventName, sync);
  }

  attachObservers();
  sync();

  return () => {
    disposed = true;
    for (const eventName of mediaEvents) {
      player.removeEventListener(eventName, sync);
    }
    for (const observer of observers) {
      observer.disconnect();
    }
  };
}

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
  const playerRef = useRef<MuxPlayerElement | null>(null);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    let cleanup = setupPreciseMuxTimeDisplays(player);
    const onLoaded = () => {
      cleanup();
      cleanup = setupPreciseMuxTimeDisplays(player);
    };

    player.addEventListener("loadedmetadata", onLoaded);

    return () => {
      player.removeEventListener("loadedmetadata", onLoaded);
      cleanup();
    };
  }, [playbackId]);

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
        ref={playerRef}
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
