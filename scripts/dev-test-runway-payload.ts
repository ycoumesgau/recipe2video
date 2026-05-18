// Dev-only smoke test: queue ONE real GPT-Image 2 task for the dumpling
// reference, poll until terminal, and print the public output URL.
//
// This is the closest we can get to validating the full happy path
// without going through the auth-gated UI:
//   1. Resolves the conditioning anchors from the live library.
//   2. Builds the prompt with @-tags + style lock.
//   3. Calls Runway with `referenceImages` + `ratio: 1080:1920`.
//   4. Reports the resulting output URL so we can visually confirm the
//      anchor is grounded on our kitchen / pan / mascot.
//
// Cost-bounded: queues a SINGLE task; respects the 5-minute timeout
// already coded into `generateReferenceImage`. Output URL is logged but
// no Supabase Storage write happens — this script does NOT touch the
// reference_assets row.

import { createClient } from "@supabase/supabase-js";

import {
  downloadRunwayOutput,
  pollRunwayTask,
  startReferenceImageGeneration,
} from "@/modules/generation/services/runway.service";
import { RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO } from "@/modules/generation/runway.constants";
import { buildReferenceImagePrompt } from "@/modules/references/use-cases/build-reference-image-prompt";
import { resolveConditioningAnchors } from "@/modules/references/use-cases/resolve-conditioning-anchors";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !serviceKey) {
  throw new Error("Supabase env vars missing.");
}
if (!process.env.RUNWAYML_API_SECRET) {
  throw new Error("RUNWAYML_API_SECRET is required for this smoke test.");
}

const referenceId = "779d4be1-3868-43ac-aab7-29d4439153c9";
const conditioningCandidates = [
  "KitchenIslandDefault",
  "baking_dish",
  "Character-sheet",
];

async function main() {
  const admin = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: ref, error: refErr } = await admin
    .from("reference_assets")
    .select("prompt")
    .eq("id", referenceId)
    .single();
  if (refErr) throw refErr;

  console.log("Resolving conditioning anchors…");
  const resolution = await resolveConditioningAnchors(
    admin,
    conditioningCandidates,
  );
  console.log(`  resolved=${resolution.anchors.length} unresolved=${resolution.unresolvedNames.length}`);

  const { promptText } = buildReferenceImagePrompt({
    storedPrompt: ref.prompt ?? "",
    anchors: resolution.anchors,
  });

  console.log("Queuing Runway text_to_image task…");
  console.log(`  model=gpt_image_2`);
  console.log(`  ratio=${RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO}`);
  console.log(`  referenceImages=[${resolution.anchors.map((a) => `@${a.tag}`).join(", ")}]`);
  console.log(`  promptText length=${promptText.length}`);
  const task = await startReferenceImageGeneration({
    promptText,
    ratio: RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
    model: "gpt_image_2",
    referenceImages: resolution.anchors.map((anchor) => ({
      uri: anchor.uri,
      tag: anchor.tag,
    })),
  });
  console.log(`  taskId=${task.id} endpoint=${task.endpoint}`);

  console.log("Polling Runway (up to 5 minutes)…");
  const final = await pollRunwayTask({
    taskId: task.id,
    timeoutMs: 5 * 60 * 1000,
  });

  console.log(`Final status: ${final.status}`);
  if (final.status !== "SUCCEEDED" || !final.output?.[0]) {
    console.error("Task did not succeed:", final.failure ?? "(no failure message)");
    process.exit(1);
  }

  const outputUrl = final.output[0];
  console.log("Output URL (valid ~1 hour):");
  console.log(outputUrl);

  // Download a small chunk just to verify the file is reachable + has the
  // right MIME type. We don't write it anywhere; the URL above is what the
  // developer opens in a browser to inspect the result.
  console.log("Verifying download is reachable…");
  const blob = await downloadRunwayOutput(outputUrl);
  console.log(`  type=${blob.type} size=${blob.size}B`);

  console.log("\nSMOKE TEST PASSED.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
