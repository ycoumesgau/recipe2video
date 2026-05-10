"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, MoreHorizontal, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  archiveVideoProjectAction,
  unarchiveVideoProjectAction,
} from "@/modules/videos/actions";

export function ProjectCardArchiveMenu({
  videoId,
  libraryMode,
}: {
  videoId: string;
  libraryMode: "active" | "archived";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Project actions"
          className="h-8 w-8 shrink-0 p-0"
          disabled={pending}
          size="sm"
          variant="ghost"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {libraryMode === "active" ? (
          <DropdownMenuItem
            onClick={() => {
              if (
                !window.confirm(
                  "Archive this project? It will disappear from the main library. You can restore it from Archived projects.",
                )
              ) {
                return;
              }
              startTransition(async () => {
                await archiveVideoProjectAction(videoId);
                router.refresh();
              });
            }}
          >
            <Archive className="mr-2 h-4 w-4" />
            Archive project
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() => {
              startTransition(async () => {
                await unarchiveVideoProjectAction(videoId);
                router.refresh();
              });
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restore to library
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
