"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  archiveVideoProjectAction,
  unarchiveVideoProjectAction,
} from "@/modules/videos/actions";

export function ProjectDetailArchiveControls({
  videoId,
  archivedAt,
}: {
  videoId: string;
  archivedAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isArchived = archivedAt != null;

  if (isArchived) {
    return (
      <Alert>
        <Archive className="h-4 w-4" />
        <AlertTitle>Archived project</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm">
            This project is hidden from the main library. Restore it to pin it
            back alongside active videos.
          </span>
          <Button
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await unarchiveVideoProjectAction(videoId);
                router.refresh();
              });
            }}
            size="sm"
            variant="secondary"
          >
            Restore to library
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              "Archive this project? It will disappear from the main library. You can reopen it anytime from Archived projects.",
            )
          ) {
            return;
          }
          startTransition(async () => {
            await archiveVideoProjectAction(videoId);
            router.push("/");
          });
        }}
        variant="outline"
      >
        <Archive className="mr-2 h-4 w-4" />
        Archive project
      </Button>
    </div>
  );
}
