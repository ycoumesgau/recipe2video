import type { LucideIcon } from "lucide-react";
import {
  Clapperboard,
  CircleDollarSign,
  Clock3,
  Film,
  Images,
  LayoutDashboard,
  MessageSquare,
  ScrollText,
} from "lucide-react";

/** Icon for the dashboard primary nav button that follows `computeNextAction().href`. */
export function resolveNextActionNavIcon(href: string | null): LucideIcon {
  if (!href) {
    return Clock3;
  }
  if (href.includes("/storyboard")) {
    return ScrollText;
  }
  if (href.includes("/references")) {
    return Images;
  }
  if (href.includes("/segments")) {
    return Clapperboard;
  }
  if (href.includes("/assembly")) {
    return Film;
  }
  if (href.includes("/costs")) {
    return CircleDollarSign;
  }
  if (/\/videos\/[^/]+$/.test(href)) {
    return MessageSquare;
  }
  return LayoutDashboard;
}
