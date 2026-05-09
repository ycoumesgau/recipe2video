import Link from "next/link";
import {
  Activity,
  BarChart3,
  BookOpen,
  FlaskConical,
  LayoutDashboard,
  PlusCircle,
  Settings,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signOutAction } from "@/modules/auth/auth.actions";

const navigationItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/videos/new", label: "New Video", icon: PlusCircle },
  { href: "/active-generations", label: "Active Generations", icon: Activity },
  { href: "/costs", label: "Costs", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/demo", label: "Demo Mode", icon: FlaskConical },
  { href: "/docs", label: "Docs", icon: BookOpen },
];

export function AppShell({
  activeTaskCount,
  children,
  creditsRemaining,
  creditsUsed,
  userEmail,
}: {
  activeTaskCount: number;
  children: React.ReactNode;
  creditsRemaining: number;
  creditsUsed: number;
  userEmail: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="hidden border-r bg-card/50 lg:block">
          <div className="flex h-16 items-center px-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Licorn internal
              </p>
              <h1 className="text-xl font-semibold tracking-tight">
                Recipe2Video
              </h1>
            </div>
          </div>
          <Separator />
          <nav className="space-y-1 p-4">
            {navigationItems.map((item) => (
              <Button
                key={`${item.href}-${item.label}`}
                asChild
                className="w-full justify-start gap-3"
                variant="ghost"
              >
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="flex h-16 items-center justify-between border-b px-4 lg:px-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Production cockpit
              </p>
              <p className="text-lg font-semibold">Runway API Hackathon</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" title={`${formatCredits(creditsUsed)} used`}>
                Credits left: {formatCredits(creditsRemaining)}
              </Badge>
              <Badge variant={activeTaskCount > 0 ? "default" : "outline"}>
                {activeTaskCount} active task{activeTaskCount === 1 ? "" : "s"}
              </Badge>
              <Badge className="hidden md:inline-flex" variant="outline">
                {userEmail}
              </Badge>
              <form action={signOutAction}>
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
