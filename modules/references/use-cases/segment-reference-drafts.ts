import { RUNWAY_MAX_SEEDANCE_REFERENCES } from "@/modules/generation/runway.constants";

export interface SegmentReferenceDraftInput {
  libraryAssetId?: string | null;
  recipeReferenceId?: string | null;
  role: string;
  required: boolean;
}

export function parseSegmentReferenceDraftsJson(
  raw: string,
): SegmentReferenceDraftInput[] {
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid references payload. Save again from the segment page.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("References payload must be a JSON array.");
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Reference entry ${index + 1} is not an object.`);
    }

    const record = entry as Record<string, unknown>;
    const libraryAssetId =
      typeof record.libraryAssetId === "string" ? record.libraryAssetId : null;
    const recipeReferenceId =
      typeof record.recipeReferenceId === "string"
        ? record.recipeReferenceId
        : null;
    const role = typeof record.role === "string" ? record.role.trim() : "";
    const required =
      typeof record.required === "boolean" ? record.required : true;

    return {
      libraryAssetId,
      recipeReferenceId,
      role,
      required,
    };
  });
}

export function normalizeSegmentReferenceDraft(
  draft: SegmentReferenceDraftInput,
): SegmentReferenceDraftInput {
  const libraryAssetId = draft.libraryAssetId?.trim() || null;
  const recipeReferenceId = draft.recipeReferenceId?.trim() || null;
  const role = draft.role.trim();

  return {
    libraryAssetId,
    recipeReferenceId,
    role,
    required: draft.required,
  };
}

export function assertSegmentReferenceDraftsAreValid(
  drafts: SegmentReferenceDraftInput[],
) {
  if (drafts.length > RUNWAY_MAX_SEEDANCE_REFERENCES) {
    throw new Error(
      `Seedance supports at most ${RUNWAY_MAX_SEEDANCE_REFERENCES} references per segment.`,
    );
  }

  const seenTargets = new Set<string>();

  for (const [index, draft] of drafts.entries()) {
    const hasLibrary = Boolean(draft.libraryAssetId);
    const hasRecipe = Boolean(draft.recipeReferenceId);

    if (hasLibrary === hasRecipe) {
      throw new Error(
        `Reference ${index + 1} must target exactly one library or recipe asset.`,
      );
    }

    if (!draft.role) {
      throw new Error(`Reference ${index + 1} needs a role.`);
    }

    const targetKey = hasLibrary
      ? `lib:${draft.libraryAssetId}`
      : `recipe:${draft.recipeReferenceId}`;
    if (seenTargets.has(targetKey)) {
      throw new Error(
        `Reference ${index + 1} duplicates another row for the same asset.`,
      );
    }
    seenTargets.add(targetKey);
  }
}
