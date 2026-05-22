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
  file_size_bytes: number | null;
  mime_type: string | null;
}

interface RecipeReferenceRow {
  id: string;
  video_id: string;
  canonical_name: string;
  media_asset_id: string | null;
  type: string;
  status: string;
}

interface FakeData {
  library: LibraryRow[];
  media: MediaRow[];
  recipeReferences?: RecipeReferenceRow[];
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

  function recipeReferenceBuilder() {
    let videoId: string | null = null;
    let canonicalNames: string[] | null = null;

    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        if (column === "video_id") {
          videoId = value as string;
        }
        return builder;
      },
      in(column: string, values: string[]) {
        if (column === "canonical_name") {
          canonicalNames = values;
        }
        return builder;
      },
      then(resolve: (value: { data: RecipeReferenceRow[]; error: null }) => void) {
        const rows = (data.recipeReferences ?? []).filter((row) => {
          if (videoId != null && row.video_id !== videoId) {
            return false;
          }
          if (canonicalNames != null && canonicalNames.length > 0) {
            return canonicalNames.includes(row.canonical_name);
          }
          return true;
        });
        resolve({ data: rows, error: null });
      },
    };

    return builder;
  }

  return {
    from(table: string) {
      if (table === "asset_library") return libraryBuilder();
      if (table === "media_assets") return mediaBuilder();
      if (table === "reference_assets") return recipeReferenceBuilder();
      throw new Error(`fakeSupabase: unexpected table ${table}`);
    },
    storage: {
      // Bucket name is irrelevant for the fake: signed URLs are uniquely
      // identified by `path`. We ignore the argument intentionally.
      from() {
        return {
          createSignedUrl(path: string) {
            const primaryMissing =
              path === "library/utensil/silicone_spatula.png";
            if (primaryMissing) {
              return Promise.resolve({
                data: null,
                error: { message: "Object not found" },
              });
            }
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
  {
    id: "lib-silicone-spatula",
    canonical_name: "silicone_spatula",
    aliases: ["SiliconeSpatula", "Maryse", "RubberSpatula", "Spatula"],
    category: "utensil",
    media_asset_id: "media-silicone-spatula",
    status: "active",
  },
];

const media: MediaRow[] = [
  {
    id: "media-kitchen",
    storage_bucket: "reference-images",
    storage_path: "library/kitchen/island_default.png",
    file_size_bytes: 4 * 1024 * 1024,
    mime_type: "image/png",
  },
  {
    id: "media-baking",
    storage_bucket: "reference-images",
    storage_path: "library/utensil/baking_dish.png",
    file_size_bytes: 2 * 1024 * 1024,
    mime_type: "image/png",
  },
  {
    id: "media-deprecated",
    storage_bucket: "reference-images",
    storage_path: "library/kitchen/deprecated_island.png",
    file_size_bytes: 1 * 1024 * 1024,
    mime_type: "image/png",
  },
  {
    id: "media-character",
    storage_bucket: "reference-images",
    storage_path: "library/character/Character-sheet.png",
    file_size_bytes: 3 * 1024 * 1024,
    mime_type: "image/png",
  },
  {
    id: "media-pose",
    storage_bucket: "reference-images",
    storage_path: "library/character/Luma-front-pose.png",
    file_size_bytes: 3 * 1024 * 1024,
    mime_type: "image/png",
  },
  {
    id: "media-silicone-spatula",
    storage_bucket: "reference-images",
    storage_path: "library/utensil/silicone_spatula.png",
    file_size_bytes: 512 * 1024,
    mime_type: "image/png",
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

test("resolveConditioningAnchors resolves SiliconeSpatula via legacy storage and spatula alias", async () => {
  const supabase = fakeSupabase({
    library,
    media,
    signedUrls: new Map([
      ["library/utensil/spatula.png", "https://signed.invalid/library/utensil/spatula.png"],
    ]),
  });

  for (const requestedName of ["SiliconeSpatula", "Spatula", "spatula"]) {
    const result = await resolveConditioningAnchors(supabase, [requestedName]);
    assert.equal(result.anchors.length, 1, requestedName);
    assert.equal(result.anchors[0]?.canonicalName, "silicone_spatula", requestedName);
    assert.equal(result.anchors[0]?.tag, "SiliconeSpatula", requestedName);
    assert.ok(
      result.anchors[0]?.uri.includes("library/utensil/spatula.png"),
      requestedName,
    );
    assert.deepEqual(result.unresolvedNames, [], requestedName);
  }
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

test("resolveConditioningAnchors resolves recipe-specific references when videoId is provided", async () => {
  const recipeReferences: RecipeReferenceRow[] = [
    {
      id: "ref-raw-croissant",
      video_id: "video-croissant",
      canonical_name: "RawCroissantCrescentsFrame",
      media_asset_id: "media-raw-croissant",
      type: "recipe_state",
      status: "approved",
    },
  ];
  const mediaWithRecipe: MediaRow[] = [
    ...media,
    {
      id: "media-raw-croissant",
      storage_bucket: "reference-images",
      storage_path: "video-croissant/ref-raw-croissant/variant.png",
      file_size_bytes: 1 * 1024 * 1024,
      mime_type: "image/png",
    },
  ];

  const supabase = fakeSupabase({
    library,
    media: mediaWithRecipe,
    recipeReferences,
  });

  const result = await resolveConditioningAnchors(
    supabase,
    ["KitchenIslandDefault", "RawCroissantCrescentsFrame"],
    "recipe_state",
    { videoId: "video-croissant", excludeReferenceId: "ref-baked" },
  );

  assert.deepEqual(result.unresolvedNames, []);
  assert.equal(result.anchors.length, 2);
  const recipeAnchor = result.anchors.find(
    (anchor) => anchor.source === "reference_assets",
  );
  assert.equal(recipeAnchor?.canonicalName, "RawCroissantCrescentsFrame");
  assert.ok(
    recipeAnchor?.uri.includes("video-croissant/ref-raw-croissant/variant.png"),
  );
});

test("resolveConditioningAnchors excludes self-reference and recipe refs without media", async () => {
  const recipeReferences: RecipeReferenceRow[] = [
    {
      id: "ref-baked",
      video_id: "video-croissant",
      canonical_name: "BakedCroissantGoldenFrame",
      media_asset_id: null,
      type: "recipe_state",
      status: "planned",
    },
    {
      id: "ref-raw",
      video_id: "video-croissant",
      canonical_name: "RawCroissantCrescentsFrame",
      media_asset_id: "media-raw",
      type: "recipe_state",
      status: "approved",
    },
  ];

  const supabase = fakeSupabase({
    library: [],
    media: [
      {
        id: "media-raw",
        storage_bucket: "reference-images",
        storage_path: "video-croissant/raw.png",
        file_size_bytes: 512 * 1024,
        mime_type: "image/png",
      },
    ],
    recipeReferences,
  });

  const result = await resolveConditioningAnchors(
    supabase,
    ["BakedCroissantGoldenFrame", "RawCroissantCrescentsFrame"],
    "recipe_state",
    { videoId: "video-croissant", excludeReferenceId: "ref-baked" },
  );

  assert.deepEqual(result.unresolvedNames, ["BakedCroissantGoldenFrame"]);
  assert.equal(result.anchors.length, 1);
  assert.equal(result.anchors[0]?.canonicalName, "RawCroissantCrescentsFrame");
});
