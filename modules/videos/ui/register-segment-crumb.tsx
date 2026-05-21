"use client";

import * as React from "react";

import { useVideoProjectBreadcrumbContext } from "@/modules/videos/ui/video-project-breadcrumb-context";

export function RegisterSegmentCrumb({ title }: { title: string }) {
  const setSegmentTitle = useVideoProjectBreadcrumbContext()?.setSegmentTitle;

  React.useLayoutEffect(() => {
    if (!setSegmentTitle) {
      return;
    }
    setSegmentTitle(title);
    return () => {
      setSegmentTitle(null);
    };
  }, [title, setSegmentTitle]);

  return null;
}
