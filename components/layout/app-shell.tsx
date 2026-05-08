import Link from "next/link";
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navigationItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/videos/new", label: "New Video", icon: PlusCircle },
  { href: "/active-generations", label: "Active Generations", icon: Activity },
  { href: "/", label: "Library", icon: Library },
  { href: "/costs", label: "Costs", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/demo", label: "Demo Mode", icon: FlaskConical },
  { href: "/docs", label: "Docs", icon: BookOpen },
];

export function AppShell({ children }: { children: React.ReactNode }) {
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
              <Badge variant="secondary">Credits: pending</Badge>
              <Badge variant="outline">0 active tasks</Badge>
            </div>
          </header>
          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
