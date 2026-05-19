import { Badge } from "@/components/ui/badge";

import type { LogicalScene } from "../storyboard.types";

export function LogicalSceneDetailPanel({
  scene,
  formatDuration = formatSeconds,
}: {
  scene: LogicalScene;
  formatDuration?: (seconds: number) => string;
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Scene {scene.position}</span>
        <Badge variant="secondary">{scene.sceneType}</Badge>
      </div>
      <DetailField label="Arc" value={scene.arc} />
      <DetailField label="Description" value={scene.description} />
      <DetailField label="Background" value={scene.bg ?? "-"} />
      <DetailField label="Zoom" value={scene.zoom ?? "-"} />
      <DetailField
        label="Duration"
        value={formatDuration(scene.durationTarget ?? 0)}
      />
      <DetailField label="Note" value={scene.note ?? "-"} />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}

function formatSeconds(seconds: number) {
  if (seconds <= 0) {
    return "-";
  }

  return `${Number(seconds.toFixed(1))}s`;
}
