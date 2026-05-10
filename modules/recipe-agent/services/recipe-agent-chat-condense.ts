import type { RecipeAgentStage } from "../recipe-agent.types";
import type { RecipeAgentStep } from "../recipe-agent.types";

export function buildRecipeAgentRunCondensedSummary(input: {
  steps: RecipeAgentStep[];
  resultSummary?: string | null;
  error?: string | null;
  stage: RecipeAgentStage;
}): string {
  const toolLabels = input.steps
    .filter((s) => s.stepType === "tool_call")
    .map((s) => s.label)
    .filter((s): s is string => Boolean(s));
  const uniqueTools = [...new Set(toolLabels)];
  const thinkingCount = input.steps.filter((s) => s.stepType === "thinking").length;
  const statusLines = input.steps
    .filter((s) => s.stepType === "status" && s.label)
    .slice(-3)
    .map((s) => s.detail ? `${s.label}: ${s.detail}` : s.label!)
    .filter(Boolean);

  const lines: string[] = [];
  lines.push(
    `**Run** · ${input.stage.replace(/_/g, " ")}`,
  );

  if (uniqueTools.length > 0) {
    const shown = uniqueTools.slice(0, 10);
    lines.push(
      `**Tools** · ${shown.join(", ")}${uniqueTools.length > 10 ? "…" : ""}`,
    );
  }

  if (thinkingCount > 0) {
    lines.push(`**Reasoning chunks** · ${thinkingCount}`);
  }

  if (statusLines.length > 0) {
    lines.push(`**Latest status** · ${statusLines.join(" · ")}`);
  }

  if (input.error) {
    lines.push(
      `**Error** · ${input.error.length > 280 ? `${input.error.slice(0, 277)}…` : input.error}`,
    );
  } else if (input.resultSummary) {
    const t = input.resultSummary;
    lines.push(
      `**Outcome** · ${t.length > 400 ? `${t.slice(0, 397)}…` : t}`,
    );
  } else {
    lines.push("**Outcome** · Run finished.");
  }

  return lines.join("\n\n");
}
