"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

export function GenerationRscSync({
  enabled,
  pollMs = 5_000,
}: {
  enabled: boolean;
  pollMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const id = setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, Math.max(1_000, pollMs));

    return () => clearInterval(id);
  }, [enabled, pollMs, router]);

  return null;
}
