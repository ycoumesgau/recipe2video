import { z } from "zod";

const AssistantCheckpointSchema = z
  .object({
    recipe2videoCheckpoint: z
      .object({
        branch: z.string().min(1).optional(),
        commitSha: z.string().min(7),
        manifestPath: z.string().optional(),
      })
      .passthrough(),
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

  const fallback = extractAssistantCheckpointFromText(text);
  if (fallback) {
    return fallback;
  }

  return null;
}

function extractAssistantCheckpointFromText(
  text: string,
): AssistantCheckpointPayload | null {
  const commitSha = extractCommitSha(text);
  if (!commitSha) {
    return null;
  }

  const branch = extractBranch(text);
  const manifestPath = extractManifestPath(text);

  return {
    recipe2videoCheckpoint: {
      commitSha,
      ...(branch ? { branch } : {}),
      ...(manifestPath ? { manifestPath } : {}),
    },
  };
}

function extractCommitSha(text: string) {
  const labeledPatterns = [
    /(?:commitSha|artifactCommitSha|latestPushedCommitSha)\s*["':=`\s]+([0-9a-f]{7,40})/i,
    /(?:sha(?:\s+pouss[eé])?|commit(?:\s+sha)?)\s*(?:est|is|:|=)?\s*`?([0-9a-f]{7,40})`?/i,
  ];

  for (const pattern of labeledPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

function extractBranch(text: string) {
  const match = text.match(
    /(?:branch|branche)\s*(?:name)?\s*(?:est|is|:|=)?\s*`?((?:recipe2video|cursor)\/[a-z0-9._/-]+)`?/i,
  );

  return match?.[1];
}

function extractManifestPath(text: string) {
  const match = text.match(
    /(agent-recipes\/[a-z0-9._-]+\/checkpoint-manifest\.json)/i,
  );

  return match?.[1];
}
