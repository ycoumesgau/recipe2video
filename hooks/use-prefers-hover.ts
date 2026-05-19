"use client";

import * as React from "react";

/**
 * True when the primary pointer supports hover (desktop mouse/trackpad).
 * False on most touch devices — use click-based popovers instead.
 */
export function usePrefersHover() {
  const [prefersHover, setPrefersHover] = React.useState(true);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setPrefersHover(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return prefersHover;
}
