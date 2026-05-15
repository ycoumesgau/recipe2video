"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";

import { dashboardNavigationItems } from "@/components/layout/dashboard-navigation";
import { BRAND_LOGO_PATH } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function DashboardMobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label="Ouvrir le menu de navigation"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton
        className="flex w-[min(100%,280px)] flex-col gap-0 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-[280px]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>
            Liens principaux du tableau de bord Recipe2Video
          </SheetDescription>
        </SheetHeader>
        <div className="flex h-16 items-center gap-3 px-5 pr-14">
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
            <h2 className="truncate font-heading text-lg font-bold tracking-tight">
              Recipe2Video
            </h2>
          </div>
        </div>
        <Separator className="bg-sidebar-border" />
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          {dashboardNavigationItems.map((item) => (
            <SheetClose key={`${item.href}-${item.label}`} asChild>
              <Button
                asChild
                className="w-full justify-start gap-3 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                variant="ghost"
              >
                <Link href={item.href}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </Button>
            </SheetClose>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
