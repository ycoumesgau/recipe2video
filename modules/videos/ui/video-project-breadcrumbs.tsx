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
    <Breadcrumb>
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

        {section.kind === "music" ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Music</BreadcrumbPage>
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
              <BreadcrumbPage>Costs & logs</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}

        {section.kind === "segments_list" ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Segments</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}

        {section.kind === "segment" ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`${prefix}/segments`}>Segments</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="max-w-[min(100%,16rem)] min-w-0 sm:max-w-md">
              {segmentTitle ? (
                <BreadcrumbPage className="truncate" title={segmentTitle}>
                  {segmentTitle}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbPage>…</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function resolveSection(
  pathname: string,
  prefix: string,
): {
  kind:
    | "overview"
    | "storyboard"
    | "references"
    | "music"
    | "assembly"
    | "costs"
    | "segments_list"
    | "segment";
} {
  if (pathname === prefix || pathname === `${prefix}/`) {
    return { kind: "overview" };
  }
  if (pathname === `${prefix}/storyboard`) {
    return { kind: "storyboard" };
  }
  if (pathname === `${prefix}/references`) {
    return { kind: "references" };
  }
  if (pathname === `${prefix}/music` || pathname === `${prefix}/music/`) {
    return { kind: "music" };
  }
  if (pathname === `${prefix}/assembly`) {
    return { kind: "assembly" };
  }
  if (pathname === `${prefix}/costs`) {
    return { kind: "costs" };
  }

  const segmentsBase = `${prefix}/segments`;
  if (pathname === segmentsBase || pathname === `${segmentsBase}/`) {
    return { kind: "segments_list" };
  }
  if (pathname.startsWith(`${segmentsBase}/`)) {
    const tail = pathname.slice(segmentsBase.length + 1);
    if (tail.length > 0 && !tail.includes("/")) {
      return { kind: "segment" };
    }
  }

  return { kind: "overview" };
}
