import { z } from "zod";

/**
 * Contractual Suno prompt artifact (`suno-prompt.json`) produced by the recipe
 * agent. Stored in `videos.recipe_data.sunoPromptV2` after successful sync.
 */
export const SunoPromptV2Schema = z
  .object({
    schemaVersion: z.number().int().positive(),
    status: z
      .object({
        recipeName: z.string().optional(),
        goal: z.string().optional(),
        model: z.string().optional(),
        targetDuration: z.string().optional(),
      })
      .strict()
      .optional(),
    fields: z
      .object({
        title: z.string(),
        styleOfMusic: z.string(),
        excludeStyles: z.string(),
        autoLyricsPrompt: z.string(),
        shortVersionPlan: z.string(),
      })
      .strict(),
    instructions: z
      .object({
        voice: z.string().optional(),
        structure: z.string().optional(),
        workflowNotes: z.string().optional(),
      })
      .strict()
      .optional(),
    qualityChecks: z.array(z.string()).optional(),
  })
  .strict();

export type SunoPromptV2 = z.infer<typeof SunoPromptV2Schema>;

export function parseSunoPromptV2FromUnknown(raw: unknown): SunoPromptV2 | null {
  const result = SunoPromptV2Schema.safeParse(raw);
  return result.success ? result.data : null;
}

export function buildMarkdownPackFromV2(data: SunoPromptV2): string {
  const f = data.fields;
  const blocks: string[] = [];

  if (data.status && Object.values(data.status).some(Boolean)) {
    const lines = ["## Recipe / session context", "```text"];
    if (data.status.recipeName) lines.push(`Recipe: ${data.status.recipeName}`);
    if (data.status.goal) lines.push(`Goal: ${data.status.goal}`);
    if (data.status.model) lines.push(`Model: ${data.status.model}`);
    if (data.status.targetDuration) lines.push(`Target duration: ${data.status.targetDuration}`);
    lines.push("```");
    blocks.push(lines.join("\n"));
  }

  blocks.push(
    "## Title",
    "```text",
    f.title,
    "```",
    "## Style of Music",
    "```text",
    f.styleOfMusic,
    "```",
    "## Exclude Styles",
    "```text",
    f.excludeStyles,
    "```",
    "## Auto Lyrics Prompt",
    "```text",
    f.autoLyricsPrompt,
    "```",
    "## Short Version To Extract Later",
    "```text",
    f.shortVersionPlan,
    "```",
  );

  if (data.instructions && Object.values(data.instructions).some(Boolean)) {
    const lines = ["## Session instructions", "```text"];
    if (data.instructions.voice) lines.push(`Voice: ${data.instructions.voice}`);
    if (data.instructions.structure) lines.push(`Structure: ${data.instructions.structure}`);
    if (data.instructions.workflowNotes) {
      lines.push(`Workflow: ${data.instructions.workflowNotes}`);
    }
    lines.push("```");
    blocks.push(lines.join("\n"));
  }

  if (data.qualityChecks?.length) {
    blocks.push(
      "## Quality checks",
      "```text",
      data.qualityChecks.map((item) => `- ${item}`).join("\n"),
      "```",
    );
  }

  return blocks.join("\n\n");
}
