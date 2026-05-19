"use client";

import * as React from "react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePrefersHover } from "@/hooks/use-prefers-hover";
import { cn } from "@/lib/utils";

import type { LogicalScene } from "../storyboard.types";
import { LogicalSceneDetailPanel } from "./logical-scene-detail-panel";

const detailPanelClassName = "w-[min(24rem,calc(100vw-2rem))] max-h-[min(70vh,28rem)] overflow-y-auto p-4";

export function SceneDetailTrigger({
  scene,
  children,
  className,
}: {
  scene: LogicalScene;
  children: React.ReactNode;
  className?: string;
}) {
  const prefersHover = usePrefersHover();

  if (prefersHover) {
    return (
      <HoverCard openDelay={120} closeDelay={80}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-full rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
          >
            {children}
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="start" className={detailPanelClassName}>
          <LogicalSceneDetailPanel scene={scene} />
        </HoverCardContent>
      </HoverCard>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={detailPanelClassName}>
        <LogicalSceneDetailPanel scene={scene} />
      </PopoverContent>
    </Popover>
  );
}
