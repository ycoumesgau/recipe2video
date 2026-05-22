import type { SegmentReference } from "@/modules/storyboard/storyboard.types";

import type { AssetLibraryEntry } from "../repositories/asset-library.repository";
import type { ReferenceAsset } from "../reference.types";
import type {
  SegmentReferenceLink,
  SegmentReferenceMapping,
} from "../repositories/segment-references.repository";
import {
  matchesReference,
  normalizeReferenceName,
  type MatchableReference,
} from "../reference-matching";
import { deriveRunwayTag } from "./derive-runway-tag";

export interface SubstituteTargetIdentity {
  libraryAssetId: string | null;
  recipeReferenceId: string | null;
  declaredName: string;
  label: string;
  matchable: MatchableReference;
  runwayTag: string;
}

export function parseSubstituteTargetPickerKey(
  pickerKey: string,
): { libraryAssetId: string | null; recipeReferenceId: string | null } {
  if (pickerKey.startsWith("library:")) {
    return {
      libraryAssetId: pickerKey.slice("library:".length),
      recipeReferenceId: null,
    };
  }
  if (pickerKey.startsWith("recipe:")) {
    return {
      libraryAssetId: null,
      recipeReferenceId: pickerKey.slice("recipe:".length),
    };
  }
  throw new Error(
    `Invalid substitute target '${pickerKey}'. Expected library:<uuid> or recipe:<uuid>.`,
  );
}

export function buildSubstituteTargetIdentity(
  target:
    | { kind: "library"; entry: AssetLibraryEntry }
    | { kind: "recipe"; entry: ReferenceAsset },
): SubstituteTargetIdentity {
  if (target.kind === "library") {
    const declaredName = target.entry.aliases[0] ?? target.entry.canonicalName;
    return {
      libraryAssetId: target.entry.id,
      recipeReferenceId: null,
      declaredName,
      label: declaredName,
      matchable: {
        canonicalName: target.entry.canonicalName,
        aliases: target.entry.aliases,
      },
      runwayTag: deriveRunwayTag(declaredName),
    };
  }

  return {
    libraryAssetId: null,
    recipeReferenceId: target.entry.id,
    declaredName: target.entry.canonicalName,
    label: target.entry.canonicalName,
    matchable: {
      canonicalName: target.entry.canonicalName,
      aliases: target.entry.aliases ?? [],
    },
    runwayTag: deriveRunwayTag(target.entry.canonicalName),
  };
}

export function buildSourceMatchable(source: ReferenceAsset): MatchableReference {
  return {
    canonicalName: source.canonicalName,
    aliases: source.aliases ?? [],
  };
}

export function collectPromptReplacementTags(
  source: MatchableReference,
  targetTag: string,
): Array<{ from: string; to: string }> {
  const names = new Set<string>([
    source.canonicalName,
    ...(source.aliases ?? []),
  ]);
  const pairs: Array<{ from: string; to: string }> = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const fromTag = deriveRunwayTag(trimmed);
    if (fromTag === targetTag) {
      continue;
    }
    pairs.push({ from: fromTag, to: targetTag });
  }
  return pairs;
}

export function replaceReferenceTokensInPrompt(
  text: string,
  replacements: Array<{ from: string; to: string }>,
): string {
  let result = text;
  for (const { from, to } of replacements) {
    if (from === to) {
      continue;
    }
    const pattern = new RegExp(`@${escapeRegExp(from)}\\b`, "g");
    result = result.replace(pattern, `@${to}`);
  }
  return result;
}

export function transformDeclaredSegmentReferences(
  references: SegmentReference[],
  source: MatchableReference,
  target: SubstituteTargetIdentity,
): SegmentReference[] {
  return references.map((reference) => {
    if (
      !matchesReference(source, reference.name) &&
      !matchesReference(source, reference.label)
    ) {
      return reference;
    }
    return {
      ...reference,
      name: target.declaredName,
      label: target.label,
      runwayUri: null,
      mediaAssetId: null,
    };
  });
}

export function segmentDeclaresSourceReference(
  references: SegmentReference[],
  source: MatchableReference,
): boolean {
  return references.some(
    (reference) =>
      matchesReference(source, reference.name) ||
      matchesReference(source, reference.label),
  );
}

export function transformSegmentReferenceMappings(input: {
  links: SegmentReferenceLink[];
  sourceReferenceId: string;
  target: SubstituteTargetIdentity;
  ensureTargetLink: boolean;
}): {
  mappings: SegmentReferenceMapping[];
  linksRewired: number;
  linksRemovedAsDuplicate: number;
} {
  const sorted = [...input.links].sort((left, right) => left.position - right.position);
  const mappings: SegmentReferenceMapping[] = [];
  const seenTargets = new Set<string>();
  let linksRewired = 0;
  let linksRemovedAsDuplicate = 0;

  for (const link of sorted) {
    let libraryAssetId = link.libraryAssetId;
    let recipeReferenceId = link.recipeReferenceId;

    if (link.recipeReferenceId === input.sourceReferenceId) {
      libraryAssetId = input.target.libraryAssetId;
      recipeReferenceId = input.target.recipeReferenceId;
      linksRewired += 1;
    }

    const targetKey = libraryAssetId
      ? `lib:${libraryAssetId}`
      : recipeReferenceId
        ? `recipe:${recipeReferenceId}`
        : null;

    if (!targetKey) {
      continue;
    }

    if (seenTargets.has(targetKey)) {
      linksRemovedAsDuplicate += 1;
      continue;
    }

    seenTargets.add(targetKey);
    mappings.push({
      segmentId: link.segmentId,
      libraryAssetId,
      recipeReferenceId,
      role: link.role,
      position: mappings.length,
      required: link.required,
    });
  }

  const targetKey = input.target.libraryAssetId
    ? `lib:${input.target.libraryAssetId}`
    : input.target.recipeReferenceId
      ? `recipe:${input.target.recipeReferenceId}`
      : null;

  if (input.ensureTargetLink && targetKey && !seenTargets.has(targetKey)) {
    const segmentId = sorted[0]?.segmentId ?? mappings[0]?.segmentId;
    if (segmentId) {
      mappings.push({
        segmentId,
        libraryAssetId: input.target.libraryAssetId,
        recipeReferenceId: input.target.recipeReferenceId,
        role: "substituted reference",
        position: mappings.length,
        required: true,
      });
      seenTargets.add(targetKey);
    }
  }

  return { mappings, linksRewired, linksRemovedAsDuplicate };
}

export function substituteConditioningNames(
  names: string[],
  source: MatchableReference,
  target: SubstituteTargetIdentity,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of names) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }

    let next = trimmed;
    if (matchesReference(source, trimmed)) {
      next = target.declaredName;
    }

    if (
      matchesReference(source, next) &&
      !matchesReference(target.matchable, next)
    ) {
      continue;
    }

    const key = normalizeReferenceName(next);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(next);
  }

  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
