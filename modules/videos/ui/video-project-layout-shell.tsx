"use client";

import {
  VideoProjectBreadcrumbProvider,
} from "@/modules/videos/ui/video-project-breadcrumb-context";
import { VideoProjectBreadcrumbs } from "@/modules/videos/ui/video-project-breadcrumbs";
import { VideoProjectSubnav } from "@/modules/videos/ui/video-project-subnav";

export function VideoProjectLayoutShell({
  children,
  headerAside,
  projectTitle,
  videoId,
}: {
  children: React.ReactNode;
  headerAside?: React.ReactNode;
  projectTitle: string;
  videoId: string;
}) {
  return (
    <VideoProjectBreadcrumbProvider>
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <VideoProjectBreadcrumbs projectTitle={projectTitle} videoId={videoId} />
        {headerAside}
      </div>
      <VideoProjectSubnav videoId={videoId} />
      {children}
    </VideoProjectBreadcrumbProvider>
  );
}
