import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { PromptDiff } from "../feedback.types";

export function PromptDiffViewer({ diff }: { diff: PromptDiff }) {
  return (
    <div className="overflow-hidden rounded-lg border text-sm">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <span className="font-medium">Prompt diff</span>
        <Badge variant="outline">{diff.lines.length} lines</Badge>
      </div>
      <div className="max-h-[420px] overflow-auto font-mono text-xs leading-relaxed">
        {diff.lines.map((line, index) => (
          <div
            className={cn(
              "grid grid-cols-[2rem_1fr] gap-2 border-b px-3 py-1 last:border-b-0",
              line.type === "added" && "bg-emerald-500/10 text-emerald-900",
              line.type === "removed" && "bg-red-500/10 text-red-900",
              line.type === "unchanged" && "bg-background text-muted-foreground",
            )}
            key={`${line.type}-${index}-${line.text}`}
          >
            <span className="select-none text-right">
              {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
            </span>
            <span className="whitespace-pre-wrap">{line.text || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
