import { z } from "zod";

const AssistantCheckpointSchema = z
  .object({
    recipe2videoCheckpoint: z
      .object({
        branch: z.string().min(1),
        commitSha: z.string().min(7),
        manifestPath: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export type AssistantCheckpointPayload = z.infer<typeof AssistantCheckpointSchema>;

export function extractAssistantCheckpoint(
  text: string | undefined,
): AssistantCheckpointPayload | null {
  if (!text?.trim()) {
    return null;
  }

  const blocks = text.match(
    /```(?:json|JSON)?\s*([\s\S]*?)```/g,
  );

  const candidates: string[] = [];

  if (blocks) {
    for (const block of blocks) {
      const inner = block.replace(/^```[^\n]*\n/, "").replace(/```$/, "").trim();
      candidates.push(inner);
    }
  }

  candidates.push(text);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const result = AssistantCheckpointSchema.safeParse(parsed);

      if (result.success) {
        return result.data;
      }
    } catch {
      // Try next candidate.
    }
  }

  return null;
}
