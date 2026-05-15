import Image from "next/image";
import Link from "next/link";

import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import { dashboardNavigationItems } from "@/components/layout/dashboard-navigation";
import { ThemeModeDropdown } from "@/components/layout/theme-mode-dropdown";
import { BRAND_LOGO_PATH } from "@/lib/branding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DashboardDataModeSwitch } from "@/components/layout/dashboard-data-mode-switch";
import { signOutAction } from "@/modules/auth/auth.actions";
import type { DashboardDataMode } from "@/modules/dashboard/dashboard-data-mode.shared";

export function AppShell({
  activeTaskCount,
  children,
  creditsRemaining,
  creditsUsed,
  dashboardDataMode,
  userEmail,
}: {
  activeTaskCount: number;
  children: React.ReactNode;
  creditsRemaining: number | null;
  creditsUsed: number;
  dashboardDataMode: DashboardDataMode;
  userEmail: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
          <div className="flex h-16 items-center gap-3 px-5">
            <Image
              alt="Licorn"
              className="size-10 shrink-0 object-contain"
              height={40}
              src={BRAND_LOGO_PATH}
              width={40}
              unoptimized
              priority
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-sidebar-foreground/65">
                Licorn · cockpit interne
              </p>
              <h1 className="truncate font-heading text-lg font-bold tracking-tight">
                Recipe2Video
              </h1>
            </div>
          </div>
          <Separator className="bg-sidebar-border" />
          <nav className="space-y-1 p-4">
            {dashboardNavigationItems.map((item) => (
              <Button
                key={`${item.href}-${item.label}`}
                asChild
                className="w-full justify-start gap-3 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                variant="ghost"
              >
                <Link href={item.href}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="relative flex min-h-14 flex-shrink-0 flex-col gap-3 border-b px-4 py-3 lg:min-h-16 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-between lg:gap-x-4 lg:gap-y-0 lg:px-6">
            <div className="absolute top-3 right-4 z-20 lg:hidden">
              <DashboardMobileNav />
            </div>
            <div className="w-full min-w-0 shrink-0 pr-14 lg:w-auto lg:max-w-[min(100%,42rem)] lg:shrink lg:pr-0">
              <p className="text-sm font-medium text-muted-foreground">
                Production cockpit
              </p>
              <p className="font-heading text-lg font-bold leading-snug break-words sm:max-md:text-base">
                Runway API Hackathon
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-2 sm:w-auto sm:max-w-none sm:justify-end lg:ml-auto lg:w-auto lg:flex-nowrap">
              <DashboardDataModeSwitch mode={dashboardDataMode} />
              <Badge
                variant="secondary"
                title={`${formatCredits(creditsUsed)} logged in this app`}
              >
                {creditsRemaining === null
                  ? "Runway balance: n/a"
                  : `Credits left: ${formatCredits(creditsRemaining)}`}
              </Badge>
              <Badge variant={activeTaskCount > 0 ? "default" : "outline"}>
                {activeTaskCount} active task{activeTaskCount === 1 ? "" : "s"}
              </Badge>
              <Badge
                className="hidden min-w-0 max-w-[min(240px,calc(100vw-18rem))] truncate md:inline-flex"
                variant="outline"
              >
                {userEmail}
              </Badge>
              <ThemeModeDropdown />
              <form action={signOutAction} className="shrink-0">
                <Button size="sm" type="submit" variant="ghost">
                  Sign out
                </Button>
              </form>
            </div>
          </header>
          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

function formatCredits(value: number) {
  return `${value.toLocaleString("en-US")} cr`;
}
