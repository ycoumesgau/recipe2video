"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Submit control for reference server actions. Disables while the form POST
 * is in flight so a double-click cannot queue duplicate Runway jobs before
 * the redirect + RSC refresh land.
 */
export function ReferenceFormSubmitButton({
  children,
  disabled,
  icon,
  pendingLabel,
  variant = "default",
}: {
  children: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  pendingLabel?: string;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} size="sm" type="submit" variant={variant}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
