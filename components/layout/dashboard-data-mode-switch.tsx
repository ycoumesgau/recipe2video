"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { DashboardDataMode } from "@/modules/dashboard/dashboard-data-mode.shared";
import { setDashboardDataMode } from "@/modules/dashboard/set-dashboard-data-mode.action";

export function DashboardDataModeSwitch({
  mode,
}: {
  mode: DashboardDataMode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const switchTo = (next: DashboardDataMode) => {
    if (next === mode || pending) {
      return;
    }

    startTransition(() => {
      void setDashboardDataMode(next).then(() => {
        router.refresh();
      });
    });
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1"
      role="group"
      aria-label="Dashboard data source"
    >
      <Button
        aria-pressed={mode === "live"}
        className="h-8 flex-1 px-2 text-xs sm:flex-none"
        disabled={pending}
        onClick={() => switchTo("live")}
        size="sm"
        type="button"
        variant={mode === "live" ? "default" : "ghost"}
      >
        Live
      </Button>
      <Button
        aria-pressed={mode === "mock"}
        className="h-8 flex-1 px-2 text-xs sm:flex-none"
        disabled={pending}
        onClick={() => switchTo("mock")}
        size="sm"
        type="button"
        variant={mode === "mock" ? "secondary" : "ghost"}
      >
        Mock
      </Button>
    </div>
  );
}
