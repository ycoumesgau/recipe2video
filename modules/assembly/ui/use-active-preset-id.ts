"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function storageKey(videoId: string) {
  return `assembly:active-preset:${videoId}`;
}

export function useActivePresetId(
  videoId: string,
  presets: Array<{ id: string }>,
  serverActivePresetId: string | null,
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const presetIds = useMemo(
    () => new Set(presets.map((preset) => preset.id)),
    [presets],
  );

  const resolvedFromServer = useMemo(() => {
    if (serverActivePresetId && presetIds.has(serverActivePresetId)) {
      return serverActivePresetId;
    }
    return presets[0]?.id ?? null;
  }, [presetIds, presets, serverActivePresetId]);

  const queryPresetId = searchParams.get("preset");
  const queryPresetValid =
    queryPresetId && presetIds.has(queryPresetId) ? queryPresetId : null;

  const activePresetId = queryPresetValid ?? resolvedFromServer;

  const setActivePresetId = useCallback(
    (presetId: string) => {
      if (!presetIds.has(presetId)) {
        return;
      }

      try {
        localStorage.setItem(storageKey(videoId), presetId);
      } catch {
        // ignore quota / private mode
      }

      const params = new URLSearchParams(searchParams.toString());
      params.set("preset", presetId);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, presetIds, router, searchParams, videoId],
  );

  return { activePresetId, setActivePresetId };
}
