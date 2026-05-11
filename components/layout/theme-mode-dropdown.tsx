"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Clair", Icon: Sun },
  { value: "dark", label: "Sombre", Icon: Moon },
  { value: "system", label: "Système", Icon: Monitor },
] as const;

function subscribeToHydrated() {
  return () => {};
}

function useHydrated() {
  return useSyncExternalStore(
    subscribeToHydrated,
    () => true,
    () => false,
  );
}

export function ThemeModeDropdown() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  const active = theme ?? "system";
  const TriggerIcon =
    active === "light" ? Sun : active === "dark" ? Moon : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Choisir le thème d’affichage"
          className="shrink-0"
          size="icon-sm"
          variant="outline"
        >
          {hydrated ? (
            <TriggerIcon className="size-4" />
          ) : (
            <Monitor className="size-4 opacity-70" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>Apparence</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => setTheme(value)}
          value={active}
        >
          {OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="size-4 opacity-80" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
