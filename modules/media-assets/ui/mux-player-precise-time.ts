import type MuxPlayerElement from "@mux/mux-player";

import {
  formatVideoReviewTime,
  formatVideoReviewTimeRange,
} from "./format-video-review-time";

/** Walks open shadow roots — required because Mux nests controls under `media-theme`. */
export function findInDeepShadow(
  root: Document | Element | ShadowRoot,
  selector: string,
): Element | null {
  const match = root.querySelector(selector);
  if (match) {
    return match;
  }

  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) {
      const nested = findInDeepShadow(element.shadowRoot, selector);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

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

export function setupPreciseMuxTimeDisplays(player: MuxPlayerElement) {
  const root = player.shadowRoot;
  if (!root) {
    return () => {};
  }

  let disposed = false;
  const observers: MutationObserver[] = [];

  const getDisplays = () => ({
    timeDisplay: findInDeepShadow(root, "media-time-display"),
    previewDisplay: findInDeepShadow(root, "media-preview-time-display"),
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

  const watch = (target: Node, options: MutationObserverInit) => {
    const observer = new MutationObserver(sync);
    observer.observe(target, options);
    observers.push(observer);
  };

  const attachObservers = () => {
    const { timeDisplay, previewDisplay } = getDisplays();

    if (timeDisplay) {
      const slot = timeDisplay.shadowRoot?.querySelector("slot");
      if (slot) {
        watch(slot, { childList: true, characterData: true, subtree: true });
      }

      watch(timeDisplay, {
        attributes: true,
        attributeFilter: ["remaining", "mediacurrenttime", "mediaduration"],
      });
    }

    if (previewDisplay) {
      watch(previewDisplay, {
        attributes: true,
        attributeFilter: ["mediapreviewtime"],
      });

      const slot = previewDisplay.shadowRoot?.querySelector("slot");
      if (slot) {
        watch(slot, { childList: true, characterData: true, subtree: true });
      }
    }

    // Controls render inside media-theme's shadow root after the player upgrades.
    const mediaTheme = root.querySelector("media-theme");
    if (mediaTheme?.shadowRoot) {
      watch(mediaTheme.shadowRoot, { childList: true, subtree: true });
    }

    watch(root, { childList: true, subtree: true });
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

/** Retries until Mux has mounted its themed control bar in nested shadow DOM. */
export function setupPreciseMuxTimeDisplaysWhenReady(
  player: MuxPlayerElement,
  maxAttempts = 120,
) {
  let cleanup = () => {};
  let attempts = 0;
  let frameId = 0;

  const trySetup = () => {
    cleanup();
    cleanup = setupPreciseMuxTimeDisplays(player);

    const root = player.shadowRoot;
    const hasControls =
      root != null &&
      findInDeepShadow(root, "media-time-display") != null;

    if (hasControls || attempts >= maxAttempts) {
      return;
    }

    attempts += 1;
    frameId = requestAnimationFrame(trySetup);
  };

  trySetup();

  return () => {
    cancelAnimationFrame(frameId);
    cleanup();
  };
}
