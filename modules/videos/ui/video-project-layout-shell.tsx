"use client";

import {
  VideoProjectBreadcrumbProvider,
} from "@/modules/videos/ui/video-project-breadcrumb-context";
import { VideoProjectBreadcrumbs } from "@/modules/videos/ui/video-project-breadcrumbs";
import { VideoProjectSubnav } from "@/modules/videos/ui/video-project-subnav";

export function VideoProjectLayoutShell({
  children,
  projectTitle,
  videoId,
}: {
  children: React.ReactNode;
  projectTitle: string;
  videoId: string;
}) {
  return (
    <VideoProjectBreadcrumbProvider>
      <VideoProjectBreadcrumbs projectTitle={projectTitle} videoId={videoId} />
      <VideoProjectSubnav videoId={videoId} />
      {children}
    </VideoProjectBreadcrumbProvider>
  );
}
