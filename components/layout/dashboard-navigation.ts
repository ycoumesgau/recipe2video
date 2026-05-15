import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  FlaskConical,
  LayoutDashboard,
  Library,
  PlusCircle,
  Settings,
} from "lucide-react";

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const dashboardNavigationItems: DashboardNavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/videos/new", label: "New Video", icon: PlusCircle },
  { href: "/active-generations", label: "Active Generations", icon: Activity },
  { href: "/library", label: "Library", icon: Library },
  { href: "/costs", label: "Costs", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/demo", label: "Demo Mode", icon: FlaskConical },
  { href: "/docs", label: "Docs", icon: BookOpen },
];
