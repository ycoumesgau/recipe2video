"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const linkClass =
  "relative inline-flex items-center justify-center rounded-md border border-transparent px-2 py-1.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring dark:text-muted-foreground dark:hover:text-foreground";

const linkActiveClass =
  "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30 dark:text-foreground";

export function VideoProjectSubnav({ videoId }: { videoId: string }) {
  const pathname = usePathname();
  const base = `/videos/${videoId}`;

  const isOverview =
    pathname === base || pathname === `${base}/`;
  const isStoryboard = pathname.startsWith(`${base}/storyboard`);
  const isReferences = pathname.startsWith(`${base}/references`);
  const isSegments =
    pathname === `${base}/segments` ||
    pathname === `${base}/segments/` ||
    pathname.startsWith(`${base}/segments/`);
  const isAssembly = pathname.startsWith(`${base}/assembly`);
  const isCosts = pathname.startsWith(`${base}/costs`);

  const items: { href: string; label: string; active: boolean }[] = [
    { href: base, label: "Overview", active: isOverview },
    { href: `${base}/storyboard`, label: "Storyboard", active: isStoryboard },
    { href: `${base}/references`, label: "References", active: isReferences },
    { href: `${base}/segments`, label: "Segments", active: isSegments },
    { href: `${base}/assembly`, label: "Assembly", active: isAssembly },
    { href: `${base}/costs`, label: "Costs & logs", active: isCosts },
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
