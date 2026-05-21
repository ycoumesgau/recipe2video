"use client";

import * as React from "react";

type VideoProjectBreadcrumbContextValue = {
  segmentTitle: string | null;
  setSegmentTitle: (value: string | null) => void;
};

const VideoProjectBreadcrumbContext =
  React.createContext<VideoProjectBreadcrumbContextValue | null>(null);

export function VideoProjectBreadcrumbProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [segmentTitle, setSegmentTitleState] = React.useState<string | null>(
    null,
  );
  const setSegmentTitle = React.useCallback((value: string | null) => {
    setSegmentTitleState(value);
  }, []);

  const value = React.useMemo(
    () => ({ segmentTitle, setSegmentTitle }),
    [segmentTitle, setSegmentTitle],
  );

  return (
    <VideoProjectBreadcrumbContext.Provider value={value}>
      {children}
    </VideoProjectBreadcrumbContext.Provider>
  );
}

export function useVideoProjectBreadcrumbContext() {
  return React.useContext(VideoProjectBreadcrumbContext);
}
