import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Bloc KPI aligné sur le composant Metric Pantry (Figma 1305:7151) :
 * bordure 2px, rayon 24px, padding 24px, valeur 32px / lh 48px puis libellé 14px.
 */
export function LicornKpiCard({
  value,
  label,
  helper,
  className,
}: {
  value: ReactNode;
  label: string;
  helper?: string;
  className?: string;
}) {
  return (
    <Card size="sm" className={cn("licorn-kpi-card", className)}>
      <div className="flex w-full flex-col items-start">
        <p className="licorn-metric-value">{value}</p>
        <p className="licorn-metric-label">{label}</p>
        {helper ? <p className="licorn-metric-hint">{helper}</p> : null}
      </div>
    </Card>
  );
}
