import assert from "node:assert/strict";
import test from "node:test";

import type { AssetLibraryEntry } from "@/modules/references/repositories/asset-library.repository";

import { renderAssetReferenceSkillMarkdown } from "./asset-reference-skill-markdown";

function entry(partial: Partial<AssetLibraryEntry>): AssetLibraryEntry {
  return {
    id: partial.id ?? "id",
    canonicalName: partial.canonicalName ?? "name",
    aliases: partial.aliases ?? [],
    category: partial.category ?? "kitchen",
    mediaAssetId: partial.mediaAssetId ?? null,
    description: partial.description ?? null,
    status: partial.status ?? "active",
    createdBy: partial.createdBy ?? null,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00Z",
  };
}

test("renderAssetReferenceSkillMarkdown groups by category in canonical order", () => {
  const markdown = renderAssetReferenceSkillMarkdown({
    generatedAtUtc: "2026-05-11T07:00:00Z",
    entries: [
      entry({ canonicalName: "whisk", category: "utensil", aliases: ["Whisk"] }),
      entry({
        canonicalName: "island_default",
        category: "kitchen",
        aliases: ["KitchenIslandDefault"],
        description: "Canonical kitchen island.",
      }),
      entry({
        canonicalName: "character-sheet",
        category: "character",
        aliases: ["CharacterSheet"],
      }),
    ],
  });

  // Kitchen must come before Character must come before Utensils.
  const kitchenIdx = markdown.indexOf("### Kitchen");
  const characterIdx = markdown.indexOf("### Character (master sheet)");
  const utensilsIdx = markdown.indexOf("### Utensils");
  assert.ok(kitchenIdx > 0 && characterIdx > 0 && utensilsIdx > 0);
  assert.ok(kitchenIdx < characterIdx);
  assert.ok(characterIdx < utensilsIdx);

  // Each entry must surface its @-handle from the first alias.
  assert.match(markdown, /@KitchenIslandDefault/);
  assert.match(markdown, /@CharacterSheet/);
  assert.match(markdown, /@Whisk/);

  // File paths follow the workspace folder convention from constants.
  assert.match(
    markdown,
    /from `assets\/kitchen\/island_default\.png` — Canonical kitchen island\./,
  );
  // utensil category lives under the misspelled-by-design `ustensils/` folder.
  assert.match(markdown, /from `assets\/ustensils\/whisk\.png`/);
});

test("renderAssetReferenceSkillMarkdown drops deprecated entries", () => {
  const markdown = renderAssetReferenceSkillMarkdown({
    generatedAtUtc: "2026-05-11T07:00:00Z",
    entries: [
      entry({
        canonicalName: "active_oven",
        category: "kitchen",
        aliases: ["OvenWide"],
        status: "active",
      }),
      entry({
        canonicalName: "deprecated_oven",
        category: "kitchen",
        aliases: ["OldOven"],
        status: "deprecated",
      }),
    ],
  });

  assert.match(markdown, /@OvenWide/);
  assert.doesNotMatch(markdown, /@OldOven/);
  assert.doesNotMatch(markdown, /deprecated_oven/);
});

test("renderAssetReferenceSkillMarkdown orders within a category alphabetically by handle", () => {
  const markdown = renderAssetReferenceSkillMarkdown({
    generatedAtUtc: "2026-05-11T07:00:00Z",
    entries: [
      entry({
        canonicalName: "zoo",
        category: "kitchen",
        aliases: ["ZooBackground"],
      }),
      entry({
        canonicalName: "alpha",
        category: "kitchen",
        aliases: ["AlphaBackground"],
      }),
      entry({
        canonicalName: "middle",
        category: "kitchen",
        aliases: ["MiddleBackground"],
      }),
    ],
  });

  const alphaIdx = markdown.indexOf("@AlphaBackground");
  const middleIdx = markdown.indexOf("@MiddleBackground");
  const zooIdx = markdown.indexOf("@ZooBackground");
  assert.ok(alphaIdx > 0 && middleIdx > 0 && zooIdx > 0);
  assert.ok(alphaIdx < middleIdx);
  assert.ok(middleIdx < zooIdx);
});

test("renderAssetReferenceSkillMarkdown falls back to canonical_name when no alias is set", () => {
  const markdown = renderAssetReferenceSkillMarkdown({
    generatedAtUtc: "2026-05-11T07:00:00Z",
    entries: [
      entry({
        canonicalName: "Facial-expressions",
        category: "character_expression",
        aliases: [],
      }),
    ],
  });

  assert.match(markdown, /@Facial-expressions/);
});

test("renderAssetReferenceSkillMarkdown is deterministic across re-renders", () => {
  const baseInput = {
    generatedAtUtc: "2026-05-11T07:00:00Z",
    entries: [
      entry({
        canonicalName: "island_default",
        category: "kitchen",
        aliases: ["KitchenIslandDefault"],
      }),
      entry({
        canonicalName: "whisk",
        category: "utensil",
        aliases: ["Whisk"],
      }),
    ],
  };
  const first = renderAssetReferenceSkillMarkdown(baseInput);
  const second = renderAssetReferenceSkillMarkdown(baseInput);
  assert.equal(first, second);
});
