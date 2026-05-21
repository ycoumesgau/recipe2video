"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

const linkClass =
  "relative inline-flex items-center justify-center rounded-md border border-transparent px-2 py-1.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring dark:text-muted-foreground dark:hover:text-foreground";

const linkActiveClass =
  "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30 dark:text-foreground";

export function VideoProjectSubnav({ videoId }: { videoId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const conversation = searchParams.get("conversation");
  const base = `/videos/${videoId}`;

  function hrefFor(path: string) {
    if (!conversation) {
      return path;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("conversation", conversation);
    return `${path}?${params.toString()}`;
  }

  const isOverview =
    pathname === base || pathname === `${base}/`;
  const isStoryboard = pathname.startsWith(`${base}/storyboard`);
  const isReferences = pathname.startsWith(`${base}/references`);
  const isSegments =
    pathname === `${base}/segments` ||
    pathname === `${base}/segments/` ||
    pathname.startsWith(`${base}/segments/`);
  const isMusic = pathname.startsWith(`${base}/music`);
  const isCoverAndCanvas = pathname.startsWith(`${base}/cover-and-canvas`);
  const isAssembly = pathname.startsWith(`${base}/assembly`);
  const isCosts = pathname.startsWith(`${base}/costs`);

  const items: { href: string; label: string; active: boolean }[] = [
    { href: hrefFor(base), label: "Overview", active: isOverview },
    { href: hrefFor(`${base}/storyboard`), label: "Storyboard", active: isStoryboard },
    { href: hrefFor(`${base}/references`), label: "References", active: isReferences },
    { href: hrefFor(`${base}/segments`), label: "Segments", active: isSegments },
    { href: hrefFor(`${base}/music`), label: "Music", active: isMusic },
    {
      href: hrefFor(`${base}/cover-and-canvas`),
      label: "Cover & Canvas",
      active: isCoverAndCanvas,
    },
    { href: hrefFor(`${base}/assembly`), label: "Assembly", active: isAssembly },
    { href: hrefFor(`${base}/costs`), label: "Costs & logs", active: isCosts },
  ];

  return (
    <nav
      aria-label="Project sections"
      className="mb-6 flex w-full max-w-full flex-wrap gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          className={cn(linkClass, item.active && linkActiveClass)}
          href={item.href}
          prefetch={false}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
