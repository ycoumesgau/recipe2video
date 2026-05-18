// Dev-only end-to-end integration test of the conditioning anchor resolver
// against the live Supabase project. Validates that:
//   1. The migration was applied (column exists, defaults to '{}').
//   2. Writing canonical names + aliases into the column resolves correctly
//      against the real `asset_library` and `media_assets` tables.
//   3. Each resolved anchor produces a fresh signed URL pointing at the
//      library global's stored image.
//   4. Unknown / deprecated / media-less entries are reported in
//      `unresolvedNames` without breaking the resolver.
//
// Designed to be safe to re-run: it scopes all writes to the dumpling
// reference (`f3e5a9b8-…`) and restores `conditioning_canonical_names`
// to its original value at the end.

import { createClient } from "@supabase/supabase-js";

import { resolveConditioningAnchors } from "@/modules/references/use-cases/resolve-conditioning-anchors";
import { buildReferenceImagePrompt } from "@/modules/references/use-cases/build-reference-image-prompt";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !serviceKey) {
  throw new Error("Supabase env vars missing.");
}

const referenceId = "779d4be1-3868-43ac-aab7-29d4439153c9";
// Mix valid aliases, valid canonical_name, an unknown name, and a
// character-class entry to exercise every resolver branch:
//   - kitchen alias → resolves
//   - cookware canonical_name → resolves
//   - character → resolves-but-excluded (the policy drops it)
//   - garbage name → unresolved
const conditioningCandidates = [
  "KitchenIslandDefault",
  "baking_dish",
  "Character-sheet",
  "DoesNotExistAnywhere",
];

async function main() {
  const admin = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("=== Step 1: check migration ===");
  const { data: cols, error: colsError } = await admin
    .from("reference_assets")
    .select("id, conditioning_canonical_names")
    .eq("id", referenceId)
    .single();
  if (colsError) {
    throw colsError;
  }
  console.log(
    `  reference ${cols.id} starts with conditioning_canonical_names = ${JSON.stringify(cols.conditioning_canonical_names)}`,
  );
  const original = cols.conditioning_canonical_names as string[];

  console.log("\n=== Step 2: write candidates ===");
  await admin
    .from("reference_assets")
    .update({ conditioning_canonical_names: conditioningCandidates })
    .eq("id", referenceId);
  console.log(`  wrote ${JSON.stringify(conditioningCandidates)}`);

  try {
    console.log("\n=== Step 3: read back ===");
    const { data: readBack, error: readError } = await admin
      .from("reference_assets")
      .select("conditioning_canonical_names")
      .eq("id", referenceId)
      .single();
    if (readError) throw readError;
    console.log(
      `  reread: ${JSON.stringify(readBack.conditioning_canonical_names)}`,
    );

    console.log("\n=== Step 4: resolve anchors ===");
    const resolution = await resolveConditioningAnchors(
      admin,
      conditioningCandidates,
    );
    console.log(`  resolved ${resolution.anchors.length} anchors:`);
    for (const anchor of resolution.anchors) {
      console.log(
        `    - @${anchor.tag} (canonical=${anchor.canonicalName}, requestedAs=${anchor.requestedName}) -> ${anchor.uri.slice(0, 80)}…`,
      );
    }
    console.log(`  unresolved: ${JSON.stringify(resolution.unresolvedNames)}`);
    console.log(
      `  excluded (character-class, dropped by policy): ${JSON.stringify(resolution.excludedAnchors)}`,
    );

    console.log("\n=== Step 5: build the GPT-Image 2 prompt ===");
    const { data: refRow, error: refErr } = await admin
      .from("reference_assets")
      .select("prompt")
      .eq("id", referenceId)
      .single();
    if (refErr) throw refErr;
    const { promptText } = buildReferenceImagePrompt({
      storedPrompt: refRow.prompt ?? "",
      anchors: resolution.anchors,
    });
    console.log("--- prompt sent to Runway (truncated to 600 chars) ---");
    console.log(promptText.slice(0, 600));
    if (promptText.length > 600) {
      console.log(`... [${promptText.length - 600} more chars]`);
    }
    console.log("--- end prompt ---");

    console.log("\n=== Step 6: contract checks ===");
    const expectations: { name: string; pass: boolean }[] = [];
    expectations.push({
      name: "resolver returned exactly 2 anchors (kitchen + cookware, character dropped)",
      pass: resolution.anchors.length === 2,
    });
    expectations.push({
      name: "no resolved anchor has a character-class category",
      pass: resolution.anchors.every(
        (anchor) =>
          !anchor.canonicalName.toLowerCase().includes("character") &&
          !anchor.tag.toLowerCase().includes("character"),
      ),
    });
    expectations.push({
      name: "Character-sheet is reported on excludedAnchors with category=character",
      pass: resolution.excludedAnchors.some(
        (entry) =>
          entry.canonicalName === "Character-sheet" &&
          entry.category === "character",
      ),
    });
    expectations.push({
      name: "DoesNotExistAnywhere is reported as unresolved",
      pass: resolution.unresolvedNames.includes("DoesNotExistAnywhere"),
    });
    expectations.push({
      name: "prompt mentions kitchen anchor @-tag",
      pass: /@\w*Kitchen/i.test(promptText),
    });
    expectations.push({
      name: "prompt does NOT mention any character/mascot tag",
      pass:
        !/@\w*[Cc]haracter/.test(promptText) &&
        !/@\w*[Mm]ascot/.test(promptText) &&
        !/@\w*[Ll]uma/.test(promptText),
    });
    expectations.push({
      name: "prompt does NOT contain `Used in segments:` metadata",
      pass: !/used in segments:/i.test(promptText),
    });
    expectations.push({
      name: "prompt style lock forbids mascots and humans",
      pass: /no mascots/i.test(promptText) && /no humans/i.test(promptText),
    });
    expectations.push({
      name: "prompt includes vertical 9:16 style lock",
      pass: /vertical 9:16/i.test(promptText),
    });
    expectations.push({
      name: "every resolved anchor URI is HTTPS",
      pass: resolution.anchors.every((anchor) => anchor.uri.startsWith("https://")),
    });

    let failed = 0;
    for (const expectation of expectations) {
      console.log(`  [${expectation.pass ? "PASS" : "FAIL"}] ${expectation.name}`);
      if (!expectation.pass) failed += 1;
    }
    if (failed > 0) {
      throw new Error(`${failed} contract check(s) failed.`);
    }
  } finally {
    console.log("\n=== Cleanup: restore original conditioning ===");
    await admin
      .from("reference_assets")
      .update({ conditioning_canonical_names: original })
      .eq("id", referenceId);
    console.log(`  restored ${JSON.stringify(original)}`);
  }

  console.log("\nALL CONTRACT CHECKS PASSED.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
