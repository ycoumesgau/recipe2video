import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import { resolveConditioningAnchors } from "./resolve-conditioning-anchors";

interface LibraryRow {
  id: string;
  canonical_name: string;
  aliases: string[];
  category: string;
  media_asset_id: string | null;
  status: "active" | "deprecated";
}

interface MediaRow {
  id: string;
  storage_bucket: string;
  storage_path: string;
}

interface FakeData {
  library: LibraryRow[];
  media: MediaRow[];
  signedUrls?: Map<string, string>;
}

/**
 * Minimal Supabase stub that supports just enough of the Query Builder
 * surface for `resolveConditioningAnchors` and its dependency
 * `findAssetLibraryByCanonicalNames`:
 *   - `from("asset_library").select("*").or(...).eq("status", "active")`
 *   - `from("media_assets").select("...").in("id", ids)`
 *   - `storage.from(bucket).createSignedUrl(path, ttl)`
 *
 * We rebuild the query builder per `from()` so each chain is isolated.
 */
function fakeSupabase(data: FakeData): SupabaseDataClient {
  const signedUrls =
    data.signedUrls ?? new Map<string, string>();

  function libraryBuilder() {
    let status: "active" | "deprecated" | null = null;
    let nameFilter: ((row: LibraryRow) => boolean) | null = null;

    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        if (column === "status") {
          status = value as "active" | "deprecated";
        }
        return builder;
      },
      or(expression: string) {
        // We accept the shape produced by `findAssetLibraryByCanonicalNames`:
        //   canonical_name.in.("a","b"),aliases.ov.{"a","b"}
        // For tests we resolve via the same predicate: row matches if
        // canonical_name OR any alias is in the requested set.
        const names = Array.from(expression.matchAll(/"([^"]+)"/g)).map(
          (match) => match[1],
        );
        const lower = new Set(names.map((name) => name.toLowerCase()));
        nameFilter = (row) => {
          if (lower.has(row.canonical_name.toLowerCase())) return true;
          return row.aliases.some((alias) => lower.has(alias.toLowerCase()));
        };
        return builder;
      },
      then(resolve: (value: { data: LibraryRow[]; error: null }) => void) {
        const rows = data.library.filter((row) => {
          if (status && row.status !== status) return false;
          if (nameFilter && !nameFilter(row)) return false;
          return true;
        });
        resolve({ data: rows, error: null });
      },
    };

    return builder;
  }

  function mediaBuilder() {
    let ids: string[] = [];
    const builder = {
      select() {
        return builder;
      },
      in(column: string, values: string[]) {
        if (column === "id") {
          ids = values;
        }
        return builder;
      },
      then(resolve: (value: { data: MediaRow[]; error: null }) => void) {
        resolve({
          data: data.media.filter((row) => ids.includes(row.id)),
          error: null,
        });
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      if (table === "asset_library") return libraryBuilder();
      if (table === "media_assets") return mediaBuilder();
      throw new Error(`fakeSupabase: unexpected table ${table}`);
    },
    storage: {
      // Bucket name is irrelevant for the fake: signed URLs are uniquely
      // identified by `path`. We ignore the argument intentionally.
      from() {
        return {
          createSignedUrl(path: string) {
            const signed = signedUrls.get(path) ?? `https://signed.invalid/${path}`;
            return Promise.resolve({
              data: { signedUrl: signed },
              error: null,
            });
          },
        };
      },
    },
  } as unknown as SupabaseDataClient;
}

const library: LibraryRow[] = [
  {
    id: "lib-kitchen",
    canonical_name: "island_default",
    aliases: ["KitchenIslandDefault"],
    category: "kitchen",
    media_asset_id: "media-kitchen",
    status: "active",
  },
  {
    id: "lib-baking",
    canonical_name: "baking_dish",
    aliases: ["SquareBakingDish"],
    category: "utensil",
    media_asset_id: "media-baking",
    status: "active",
  },
  {
    id: "lib-spatula-no-media",
    canonical_name: "spatula_no_media",
    aliases: ["SpatulaNoMedia"],
    category: "utensil",
    // No media_asset_id: resolved but unusable, so reported as unresolved.
    media_asset_id: null,
    status: "active",
  },
  {
    id: "lib-deprecated",
    canonical_name: "deprecated_island",
    aliases: ["DeprecatedKitchen"],
    category: "kitchen",
    media_asset_id: "media-deprecated",
    status: "deprecated",
  },
  {
    id: "lib-character",
    canonical_name: "Character-sheet",
    aliases: ["CharacterSheet"],
    category: "character",
    media_asset_id: "media-character",
    status: "active",
  },
  {
    id: "lib-pose",
    canonical_name: "Luma-front-pose",
    aliases: ["LumaFrontPose"],
    category: "character_pose",
    media_asset_id: "media-pose",
    status: "active",
  },
];

const media: MediaRow[] = [
  {
    id: "media-kitchen",
    storage_bucket: "reference-images",
    storage_path: "library/kitchen/island_default.png",
  },
  {
    id: "media-baking",
    storage_bucket: "reference-images",
    storage_path: "library/utensil/baking_dish.png",
  },
  {
    id: "media-deprecated",
    storage_bucket: "reference-images",
    storage_path: "library/kitchen/deprecated_island.png",
  },
  {
    id: "media-character",
    storage_bucket: "reference-images",
    storage_path: "library/character/Character-sheet.png",
  },
  {
    id: "media-pose",
    storage_bucket: "reference-images",
    storage_path: "library/character/Luma-front-pose.png",
  },
];

test("resolveConditioningAnchors returns an anchor per resolved library entry with a Runway-safe tag", async () => {
  const supabase = fakeSupabase({ library, media });

  const result = await resolveConditioningAnchors(supabase, [
    "KitchenIslandDefault",
    "SquareBakingDish",
  ]);

  assert.equal(result.anchors.length, 2);
  assert.deepEqual(result.unresolvedNames, []);

  const [first, second] = result.anchors;
  // `KitchenIslandDefault` is 20 chars — Runway's 16-char tag cap forces
  // truncation. We keep the alphanumeric prefix so the @-mention stays
  // recognizable.
  assert.equal(first?.canonicalName, "island_default");
  assert.equal(first?.tag, "KitchenIslandDef");
  assert.equal(first?.requestedName, "KitchenIslandDefault");
  assert.ok(first?.uri.includes("library/kitchen/island_default.png"));
  assert.equal(second?.canonicalName, "baking_dish");
  assert.equal(second?.tag, "SquareBakingDish");
});

test("resolveConditioningAnchors falls back to the canonical name as tag when no alias exists", async () => {
  const libraryWithoutAlias: LibraryRow[] = [
    {
      id: "lib-no-alias",
      canonical_name: "tongs",
      aliases: [],
      category: "utensil",
      media_asset_id: "media-tongs",
      status: "active",
    },
  ];
  const mediaWithTongs: MediaRow[] = [
    {
      id: "media-tongs",
      storage_bucket: "reference-images",
      storage_path: "library/utensil/tongs.png",
    },
  ];
  const supabase = fakeSupabase({
    library: libraryWithoutAlias,
    media: mediaWithTongs,
  });

  const result = await resolveConditioningAnchors(supabase, ["tongs"]);

  // Canonical names are usually snake_case but `deriveRunwayTag` strips
  // the underscores to keep `referenceImages.tag` aligned with the
  // identifier-like form GPT-Image 2 expects in `@Mentions`. The first
  // letter is also promoted to upper-case for readability in Runway logs.
  assert.equal(result.anchors[0]?.tag, "Tongs");
});

test("resolveConditioningAnchors deduplicates two names that resolve to the same library entry", async () => {
  // The agent (or the operator pasting from the skill) might write both
  // `island_default` and `KitchenIslandDefault`. They point at the same
  // library row; we MUST emit only one anchor so we don't waste a slot.
  const supabase = fakeSupabase({ library, media });

  const result = await resolveConditioningAnchors(supabase, [
    "island_default",
    "KitchenIslandDefault",
  ]);

  assert.equal(result.anchors.length, 1);
  assert.equal(result.anchors[0]?.canonicalName, "island_default");
  assert.deepEqual(result.unresolvedNames, []);
});

test("resolveConditioningAnchors reports unknown names as unresolved", async () => {
  const supabase = fakeSupabase({ library, media });

  const result = await resolveConditioningAnchors(supabase, [
    "KitchenIslandDefault",
    "DoesNotExist",
  ]);

  assert.equal(result.anchors.length, 1);
  assert.deepEqual(result.unresolvedNames, ["DoesNotExist"]);
});

test("resolveConditioningAnchors reports library entries with no media as unresolved", async () => {
  // A library row exists for the name but has no media_asset_id (rare,
  // happens when the seed script created the row before uploading the
  // image). We cannot generate a signed URL, so the anchor is dropped
  // from the Runway payload AND surfaced to the operator.
  const supabase = fakeSupabase({ library, media });

  const result = await resolveConditioningAnchors(supabase, [
    "SpatulaNoMedia",
  ]);

  assert.equal(result.anchors.length, 0);
  assert.deepEqual(result.unresolvedNames, ["SpatulaNoMedia"]);
});

test("resolveConditioningAnchors excludes deprecated library entries", async () => {
  const supabase = fakeSupabase({ library, media });

  const result = await resolveConditioningAnchors(supabase, [
    "DeprecatedKitchen",
  ]);

  assert.equal(result.anchors.length, 0);
  assert.deepEqual(result.unresolvedNames, ["DeprecatedKitchen"]);
});

test("resolveConditioningAnchors handles an empty input list with no DB calls", async () => {
  // The fake throws on unexpected tables. If we accidentally hit asset_library
  // here, the test fails — codifying the empty-list short-circuit.
  const supabase = {
    from() {
      throw new Error("resolveConditioningAnchors must short-circuit on empty input");
    },
  } as unknown as SupabaseDataClient;

  const result = await resolveConditioningAnchors(supabase, []);
  assert.deepEqual(result, {
    anchors: [],
    unresolvedNames: [],
    excludedAnchors: [],
  });
});

test("resolveConditioningAnchors drops character-class entries even when they resolve", async () => {
  // Hard policy: the mascot character sheet, character poses, and
  // character expressions are NEVER used as anchors for recipe-state
  // images. They add noise to the dish frame; the kitchen anchor already
  // carries the Licorn visual identity. The resolver MUST silently skip
  // them and surface them on `excludedAnchors` so the operator can see
  // the policy was applied (rather than thinking their alias was a typo).
  const supabase = fakeSupabase({ library, media });

  const result = await resolveConditioningAnchors(supabase, [
    "KitchenIslandDefault",
    "CharacterSheet",
    "Luma-front-pose",
    "baking_dish",
  ]);

  // Two anchors actually go to Runway: kitchen + cookware. Character +
  // pose are dropped.
  assert.equal(result.anchors.length, 2);
  assert.deepEqual(
    result.anchors.map((anchor) => anchor.canonicalName),
    ["island_default", "baking_dish"],
  );
  assert.deepEqual(result.unresolvedNames, []);

  // Both character-class entries surface in `excludedAnchors` with their
  // category, so the UI can render a "skipped on purpose" alert.
  assert.equal(result.excludedAnchors.length, 2);
  assert.deepEqual(
    result.excludedAnchors.map((entry) => entry.category).sort(),
    ["character", "character_pose"],
  );
  const excludedNames = result.excludedAnchors.map(
    (entry) => entry.canonicalName,
  );
  assert.ok(excludedNames.includes("Character-sheet"));
  assert.ok(excludedNames.includes("Luma-front-pose"));
});

test("resolveConditioningAnchors never returns a referenceImages payload pointing at a character asset", async () => {
  // Defense-in-depth: even if the agent's plan ONLY contains character
  // entries (a misconfig), the resolver must return zero anchors so
  // Runway never receives a character-class signed URL. This protects
  // against accidental mascot tiling that the production user observed
  // on 2026-05-18.
  const supabase = fakeSupabase({ library, media });

  const result = await resolveConditioningAnchors(supabase, [
    "CharacterSheet",
    "Luma-front-pose",
  ]);

  assert.equal(result.anchors.length, 0);
  assert.equal(result.excludedAnchors.length, 2);
});

test("resolveConditioningAnchors trims whitespace before resolution", async () => {
  const supabase = fakeSupabase({ library, media });

  const result = await resolveConditioningAnchors(supabase, [
    "  KitchenIslandDefault  ",
    "",
    "\tSquareBakingDish\n",
  ]);

  assert.deepEqual(result.unresolvedNames, []);
  assert.equal(result.anchors.length, 2);
});
