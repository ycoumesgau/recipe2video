"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SegmentReviewNavigation } from "../use-cases/get-segment-review";

function formatPeerLabel(peer: { position: number; title: string }) {
  return `S${peer.position}. ${peer.title}`;
}

function segmentReviewHref(videoId: string, segmentId: string) {
  return `/videos/${videoId}/segments/${segmentId}`;
}

export function SegmentReviewHeadingNav({
  heading,
  navigation,
  videoId,
}: {
  heading: ReactNode;
  navigation: SegmentReviewNavigation | null;
  videoId: string;
}) {
  const router = useRouter();

  const prevHref = navigation?.previous
    ? segmentReviewHref(videoId, navigation.previous.segmentId)
    : null;
  const nextHref = navigation?.next
    ? segmentReviewHref(videoId, navigation.next.segmentId)
    : null;
  const showNav = Boolean(navigation && navigation.totalCount > 1);

  useEffect(() => {
    if (!prevHref && !nextHref) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable='true']"))
      ) {
        return;
      }

      if (event.key === "ArrowLeft" && prevHref) {
        event.preventDefault();
        router.push(prevHref);
      } else if (event.key === "ArrowRight" && nextHref) {
        event.preventDefault();
        router.push(nextHref);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nextHref, prevHref, router]);

  if (!showNav || !navigation) {
    return <>{heading}</>;
  }

  const positionLabel = `${navigation.currentIndex + 1} / ${navigation.totalCount}`;

  return (
    <nav
      aria-label="Navigation entre segments"
      className="mb-1 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3"
    >
      <SegmentNavButton
        aria-label={
          navigation.previous
            ? `Segment précédent : ${formatPeerLabel(navigation.previous)}`
            : "Pas de segment précédent"
        }
        disabled={!prevHref}
        href={prevHref}
      >
        <ChevronLeft className="h-4 w-4" />
      </SegmentNavButton>

      <div className="min-w-0 space-y-1 text-center sm:text-left">
        {heading}
        <p className="text-xs font-medium text-muted-foreground tabular-nums sm:text-sm">
          {positionLabel}
        </p>
      </div>

      <SegmentNavButton
        aria-label={
          navigation.next
            ? `Segment suivant : ${formatPeerLabel(navigation.next)}`
            : "Pas de segment suivant"
        }
        disabled={!nextHref}
        href={nextHref}
      >
        <ChevronRight className="h-4 w-4" />
      </SegmentNavButton>
    </nav>
  );
}

function SegmentNavButton({
  "aria-label": ariaLabel,
  children,
  disabled,
  href,
}: {
  "aria-label": string;
  children: ReactNode;
  disabled: boolean;
  href: string | null;
}) {
  if (disabled || !href) {
    return (
      <Button
        aria-label={ariaLabel}
        className="shrink-0"
        disabled
        size="icon-sm"
        type="button"
        variant="outline"
      >
        {children}
      </Button>
    );
  }

  return (
    <Button asChild className="shrink-0" size="icon-sm" variant="outline">
      <Link aria-label={ariaLabel} href={href}>
        {children}
      </Link>
    </Button>
  );
}
