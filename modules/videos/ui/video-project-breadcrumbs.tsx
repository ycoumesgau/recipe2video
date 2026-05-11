"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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

export function RegisterSegmentCrumb({ title }: { title: string }) {
  const setSegmentTitle = React.useContext(
    VideoProjectBreadcrumbContext,
  )?.setSegmentTitle;

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

export function VideoProjectBreadcrumbs({
  projectTitle,
  videoId,
}: {
  projectTitle: string;
  videoId: string;
}) {
  const pathname = usePathname();
  const ctx = React.useContext(VideoProjectBreadcrumbContext);
  const segmentTitle = ctx?.segmentTitle ?? null;

  const prefix = `/videos/${videoId}`;
  const section = resolveSection(pathname, prefix);

  return (
    <Breadcrumb className="mb-2">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link
              className="max-w-[min(100%,16rem)] truncate"
              href={prefix}
              title={projectTitle}
            >
              {projectTitle}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {section.kind === "overview" ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Overview</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}

        {section.kind === "storyboard" ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Storyboard</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}

        {section.kind === "references" ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>References</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}

        {section.kind === "assembly" ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Assembly</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}

        {section.kind === "costs" ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Costs</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}

        {section.kind === "segment" ? (
          <>
            <BreadcrumbSeparator />
            {segmentTitle ? (
              <>
                <BreadcrumbItem className="max-w-[min(100%,12rem)] sm:max-w-xs">
                  <span className="text-muted-foreground">Segment review</span>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="max-w-[min(100%,16rem)] min-w-0 sm:max-w-md">
                  <BreadcrumbPage className="truncate" title={segmentTitle}>
                    {segmentTitle}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>Segment review</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function resolveSection(
  pathname: string,
  prefix: string,
): { kind: "overview" | "storyboard" | "references" | "assembly" | "costs" | "segment" } {
  if (pathname === prefix || pathname === `${prefix}/`) {
    return { kind: "overview" };
  }
  if (pathname === `${prefix}/storyboard`) {
    return { kind: "storyboard" };
  }
  if (pathname === `${prefix}/references`) {
    return { kind: "references" };
  }
  if (pathname === `${prefix}/assembly`) {
    return { kind: "assembly" };
  }
  if (pathname === `${prefix}/costs`) {
    return { kind: "costs" };
  }
  if (pathname.startsWith(`${prefix}/segments/`)) {
    return { kind: "segment" };
  }
  return { kind: "overview" };
}
