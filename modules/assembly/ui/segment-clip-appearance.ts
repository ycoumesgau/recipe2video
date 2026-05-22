import { cn } from "@/lib/utils";

/**
 * Shared surface styles for storyboard segment clips in the Assembly bin and
 * on the video timeline. Active (accepted) variants are darker; alternates
 * are paler so the two areas stay visually aligned.
 */
export function segmentVariantClipClasses(isActiveVariant: boolean) {
  return {
    shell: isActiveVariant
      ? "border-blue-600/50 bg-blue-600/25"
      : "border-blue-500/25 bg-blue-500/10",
    badge: isActiveVariant
      ? "bg-blue-600/40 text-foreground"
      : "bg-blue-500/20 text-foreground/80",
    variantLabel: isActiveVariant
      ? "text-foreground"
      : "text-foreground/65",
    title: isActiveVariant ? "text-foreground" : "text-foreground/75",
  };
}

export function segmentVariantClipShellClass(
  isActiveVariant: boolean,
  extras?: string,
) {
  return cn(segmentVariantClipClasses(isActiveVariant).shell, extras);
}

export function segmentVariantSelectionRingClass(
  isActiveVariant: boolean,
  isSelected: boolean,
) {
  if (!isSelected) {
    return undefined;
  }
  return isActiveVariant
    ? "border-blue-600 shadow-[0_0_0_2px_rgba(37,99,235,0.55)]"
    : "border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.45)]";
}
