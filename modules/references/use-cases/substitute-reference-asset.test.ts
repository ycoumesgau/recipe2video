import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectPromptReplacementTags,
  replaceReferenceTokensInPrompt,
  substituteConditioningNames,
  transformDeclaredSegmentReferences,
  transformSegmentReferenceMappings,
  buildSubstituteTargetIdentity,
  buildSourceMatchable,
} from "./substitute-reference-asset.logic";
import type { SegmentReferenceLink } from "../repositories/segment-references.repository";

describe("substitute-reference-asset helpers", () => {
  it("rewires source recipe links to a library target and dedupes duplicates", () => {
    const links: SegmentReferenceLink[] = [
      {
        id: "link-1",
        segmentId: "seg-1",
        libraryAssetId: "lib-pastry",
        recipeReferenceId: null,
        role: "utensil",
        position: 0,
        required: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "link-2",
        segmentId: "seg-1",
        libraryAssetId: null,
        recipeReferenceId: "recipe-stub",
        role: "utensil",
        position: 1,
        required: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const target = buildSubstituteTargetIdentity({
      kind: "library",
      entry: {
        id: "lib-pastry",
        canonicalName: "pastry_brush",
        aliases: ["PastryBrush"],
        category: "utensil",
        mediaAssetId: "media-1",
        description: null,
        status: "active",
        createdBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const result = transformSegmentReferenceMappings({
      links,
      sourceReferenceId: "recipe-stub",
      target,
      ensureTargetLink: false,
    });

    assert.equal(result.mappings.length, 1);
    assert.equal(result.mappings[0]?.libraryAssetId, "lib-pastry");
    assert.equal(result.mappings[0]?.recipeReferenceId, null);
    assert.equal(result.linksRewired, 1);
    assert.equal(result.linksRemovedAsDuplicate, 1);
  });

  it("replaces @ tags in Seedance prompts", () => {
    const source = buildSourceMatchable({
      id: "recipe-stub",
      videoId: "video-1",
      type: "utensil",
      canonicalName: "PastryBrush",
      source: "agent_reference_plan",
      status: "rejected",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const target = buildSubstituteTargetIdentity({
      kind: "library",
      entry: {
        id: "lib-offset",
        canonicalName: "offset_spatula",
        aliases: ["OffsetSpatula"],
        category: "utensil",
        mediaAssetId: "media-1",
        description: null,
        status: "active",
        createdBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const replacements = collectPromptReplacementTags(source, target.runwayTag);
    const updated = replaceReferenceTokensInPrompt(
      "Use @PastryBrush only as the pastry brush. @PastryBrush handles glaze.",
      replacements,
    );

    assert.match(updated, /@OffsetSpatula\b/);
    assert.doesNotMatch(updated, /@PastryBrush\b/);
  });

  it("updates declared segment references and conditioning lists", () => {
    const source = buildSourceMatchable({
      id: "recipe-stub",
      videoId: "video-1",
      type: "utensil",
      canonicalName: "PastryBrush",
      source: "agent_reference_plan",
      status: "rejected",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const target = buildSubstituteTargetIdentity({
      kind: "library",
      entry: {
        id: "lib-pastry",
        canonicalName: "pastry_brush",
        aliases: ["PastryBrush"],
        category: "utensil",
        mediaAssetId: "media-1",
        description: null,
        status: "active",
        createdBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const declared = transformDeclaredSegmentReferences(
      [
        {
          role: "utensil",
          name: "PastryBrush",
          label: "PastryBrush",
          required: true,
        },
      ],
      source,
      target,
    );

    assert.equal(declared[0]?.name, "PastryBrush");

    const conditioning = substituteConditioningNames(
      ["PastryBrush", "KitchenIslandDefault"],
      source,
      target,
    );

    assert.deepEqual(conditioning, ["PastryBrush", "KitchenIslandDefault"]);
  });
});
