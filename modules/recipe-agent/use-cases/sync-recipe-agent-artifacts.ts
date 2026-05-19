import { createHash } from "node:crypto";

import { z } from "zod";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  mergeVideoProjectRecipeData,
  updateVideoProjectStoryboardSummary,
} from "@/modules/videos/repositories/video.repository";
import {
  replaceLogicalScenesForVideo,
  updateLogicalSceneSegmentLinks,
  upsertLogicalScenesForVideoByPosition,
  type CreateLogicalSceneInput,
} from "@/modules/storyboard/repositories/logical-scene.repository";
import { remapAllSegmentsLogicalSceneIdsForPersistence } from "@/modules/storyboard/services/resolve-logical-scene-ids";
import {
  listSegmentsByVideoId,
  replaceSegmentsForVideo,
  upsertSegmentsForVideoByPosition,
} from "@/modules/storyboard/repositories/segment.repository";
import {
  replaceAgentReferenceAssetsForVideo,
  type CreateReferenceAssetInput,
} from "@/modules/references/repositories/reference.repository";
import { findAssetLibraryByCanonicalNames } from "@/modules/references/repositories/asset-library.repository";
import {
  replaceSegmentReferencesForSegments,
  type SegmentReferenceMapping,
} from "@/modules/references/repositories/segment-references.repository";
import {
  LogicalScenesEnvelopeSchema,
  RecipeAnalysisResultSchema,
  SeedanceSegmentsEnvelopeSchema,
} from "@/modules/storyboard/services/planning-output-schemas";
import type { RecipeAnalysisResult } from "@/modules/recipe-ingest/recipe.types";
import {
  applyOutroOverrideToSegments,
  LICORN_OUTRO_REFERENCE_NAMES,
} from "@/modules/storyboard/services/seedance-outro-template";
import type {
  LogicalScene,
  SeedanceSegment,
} from "@/modules/storyboard/storyboard.types";

import type { SunoPromptV2 } from "@/modules/recipe-agent/suno-prompt-v2.schema";
import { SunoPromptV2Schema } from "@/modules/recipe-agent/suno-prompt-v2.schema";
import type { SongCoverPlan } from "@/modules/recipe-agent/song-cover-plan.schema";
import { SongCoverPlanSchema } from "@/modules/recipe-agent/song-cover-plan.schema";
import { syncSongCoverPlan } from "@/modules/song-cover/use-cases/sync-song-cover-plan";

import type {
  RecipeAgentArtifact,
  UpsertAgentArtifactInput,
} from "../recipe-agent.types";
import {
  upsertAgentArtifact,
} from "../repositories/recipe-agent.repository";

const ReferencePlanEntrySchema = z
  .object({
    id: z.string().optional(),
    type: z.string().min(1),
    canonicalName: z.string().min(1),
    role: z.string().min(1),
    priority: z.number().optional(),
    source: z.string().optional(),
    prompt: z.string().nullable().optional(),
    runwayUri: z.string().nullable().optional(),
    mediaAssetId: z.string().nullable().optional(),
    usedInSegmentIds: z.array(z.string()).optional(),
    /**
     * Names of `asset_library` canonical entries (or aliases) that GPT-Image
     * 2 should use as visual anchors when generating this recipe-specific
     * reference. The agent declares them by the same `@Tag` form used in
     * the asset-reference-system skill (e.g. `KitchenIslandDefault`,
     * `SquareBakingDish`, `Character-sheet`). Resolved at generation time;
     * unknown names are logged and skipped so a single typo never aborts a
     * regen.
     */
    conditioningReferences: z.array(z.string().min(1)).optional(),
    status: z
      .enum([
        "planned",
        "generating",
        "generated",
        "approved",
        "rejected",
        "uploaded_to_runway",
        "failed",
      ])
      .optional(),
  })
  .strict();

const ReferencePlanSchema = z
  .object({
    references: z.array(ReferencePlanEntrySchema).superRefine((references, ctx) => {
      // Enforce one logical entry per canonicalName. A canonical asset (kitchen
      // background, character pose, utensil, recipe state) reused across N
      // Seedance segments must be declared ONCE in the plan and reused via
      // `usedInSegmentIds`. Without this guarantee the agent can produce a
      // plan with N copies of `island_default` that look distinct but point
      // at the same physical asset, defeating the de-duplication on disk and
      // in `reference_assets`.
      const counts = new Map<string, number[]>();
      for (let index = 0; index < references.length; index += 1) {
        const key = references[index].canonicalName.trim().toLowerCase();
        const existing = counts.get(key);
        if (existing) {
          existing.push(index);
        } else {
          counts.set(key, [index]);
        }
      }
      for (const [name, indexes] of counts.entries()) {
        if (indexes.length > 1) {
          for (const index of indexes) {
            ctx.addIssue({
              code: "custom",
              path: [index, "canonicalName"],
              message: `Duplicate reference canonicalName '${name}' (appears ${indexes.length} times). Consolidate via usedInSegmentIds.`,
            });
          }
        }
      }
    }),
  })
  .strict();

type ReferencePlanEntry = z.infer<typeof ReferencePlanEntrySchema>;

interface BuildRecipeAgentArtifactSyncPlanInput {
  videoId: string;
  artifacts: RecipeAgentArtifact[];
}

export interface RecipeAgentArtifactSyncPlan {
  valid: boolean;
  artifactRecords: UpsertAgentArtifactInput[];
  recipePatch: {
    normalized: RecipeAnalysisResult["recipe"];
    clarifyingQuestions: RecipeAnalysisResult["clarifyingQuestions"];
    agentSyncedAt: string;
  } | null;
  logicalScenes: CreateLogicalSceneInput[];
  /** Agent artifact scene id → editorial position (for segment ↔ scene linking). */
  agentScenePositionById: Map<string, number>;
  segments: ReturnType<typeof toCreateSegmentInput>[];
  /**
   * Raw reference-plan entries from `reference-plan.json`. Resolution against
   * `asset_library` (library vs recipe-specific) is performed at sync time,
   * not at plan-build time, so the plan stays IO-free and unit-testable.
   */
  referencesRaw: ReferencePlanEntry[];
  sunoPrompt: string | null;
  sunoPromptV2: SunoPromptV2 | null;
  /**
   * Parsed `song-cover-plan.json` payload. Null when the agent did not
   * emit the (optional) artifact — the Cover & Canvas tab renders an
   * empty state with a CTA in that case.
   */
  songCoverPlan: SongCoverPlan | null;
  errors: string[];
}

export function buildRecipeAgentArtifactSyncPlan(
  input: BuildRecipeAgentArtifactSyncPlanInput,
): RecipeAgentArtifactSyncPlan {
  const artifactRecords: UpsertAgentArtifactInput[] = [];
  const errors: string[] = [];
  let recipePatch: RecipeAgentArtifactSyncPlan["recipePatch"] = null;
  let logicalScenes: CreateLogicalSceneInput[] = [];
  const agentScenePositionById = new Map<string, number>();
  let segments: RecipeAgentArtifactSyncPlan["segments"] = [];
  let rawSegments: SeedanceSegment[] = [];
  let referencesRaw: ReferencePlanEntry[] = [];
  let sunoPrompt: string | null = null;
  let sunoPromptV2: SunoPromptV2 | null = null;
  let songCoverPlan: SongCoverPlan | null = null;

  for (const artifact of input.artifacts) {
    const content = artifact.content ?? "";

    if (artifact.name === "song-cover-plan.json") {
      const songCoverOutcome = validateSongCoverPlanArtifact(content);
      artifactRecords.push({
        videoId: input.videoId,
        artifactName: artifact.name,
        artifactPath: artifact.path,
        content,
        contentHash: createArtifactContentHash(content),
        validationStatus:
          songCoverOutcome.errors.length > 0 ? "invalid" : "valid",
        validationErrors: songCoverOutcome.errors,
      });
      errors.push(
        ...songCoverOutcome.errors.map((error) => `${artifact.name}: ${error}`),
      );
      if (songCoverOutcome.value) {
        songCoverPlan = songCoverOutcome.value;
      }
      continue;
    }

    if (artifact.name === "suno-prompt.json") {
      const jsonOutcome = validateSunoPromptJsonArtifact(content);
      artifactRecords.push({
        videoId: input.videoId,
        artifactName: artifact.name,
        artifactPath: artifact.path,
        content,
        contentHash: createArtifactContentHash(content),
        validationStatus: jsonOutcome.errors.length > 0 ? "invalid" : "valid",
        validationErrors: jsonOutcome.errors,
      });
      if (jsonOutcome.value) {
        sunoPromptV2 = jsonOutcome.value;
      }
      continue;
    }

    const validation = validateArtifact({
      name: artifact.name,
      content,
      videoId: input.videoId,
    });

    artifactRecords.push({
      videoId: input.videoId,
      artifactName: artifact.name,
      artifactPath: artifact.path,
      content,
      contentHash: createArtifactContentHash(content),
      validationStatus: validation.errors.length > 0 ? "invalid" : "valid",
      validationErrors: validation.errors,
    });

    errors.push(...validation.errors.map((error) => `${artifact.name}: ${error}`));

    if (!validation.value) {
      continue;
    }

    if (artifact.name === "recipe-analysis.json") {
      const recipeAnalysis = validation.value as RecipeAnalysisResult;
      recipePatch = {
        normalized: recipeAnalysis.recipe,
        clarifyingQuestions: recipeAnalysis.clarifyingQuestions,
        agentSyncedAt: new Date().toISOString(),
      };
    }

    if (artifact.name === "logical-scenes.json") {
      const agentLogicalScenes = (validation.value as { logicalScenes: LogicalScene[] })
        .logicalScenes;
      for (const scene of agentLogicalScenes) {
        agentScenePositionById.set(scene.id, scene.position);
      }
      logicalScenes = agentLogicalScenes.map(toCreateLogicalSceneInput);
    }

    if (artifact.name === "seedance-segments.json") {
      // Persist the raw agent-emitted segments here; the outro override
      // is applied below once we also have `referencesRaw` available.
      rawSegments = (validation.value as { seedanceSegments: SeedanceSegment[] })
        .seedanceSegments;
    }

    if (artifact.name === "reference-plan.json") {
      referencesRaw = (validation.value as z.infer<typeof ReferencePlanSchema>)
        .references;
    }

    if (artifact.name === "suno-prompt.md") {
      sunoPrompt = content;
    }
  }

  // Standardized outro override: any segment with
  // `arc === licorn_celebration_outro` gets its prompt, references and
  // duration rewritten to the canonical template. The dish description
  // is sourced from `reference-plan.json[FinalDishVisual].prompt`. We do
  // this AFTER the artifact loop so both inputs are in scope; if the
  // agent emitted only `seedance-segments.json` (unlikely in practice)
  // the override skips outro segments and surfaces an error.
  const finalDishDescription =
    referencesRaw.find(
      (entry) => entry.canonicalName === LICORN_OUTRO_REFERENCE_NAMES.finalDishVisual,
    )?.prompt ?? null;
  const outroOutcome = applyOutroOverrideToSegments({
    segments: rawSegments,
    finalDishDescription,
  });
  errors.push(...outroOutcome.errors);
  segments = outroOutcome.segments.map((segment) =>
    toCreateSegmentInput(input.videoId, segment),
  );

  return {
    valid: errors.length === 0,
    artifactRecords,
    recipePatch,
    logicalScenes,
    agentScenePositionById,
    segments,
    referencesRaw,
    sunoPrompt,
    sunoPromptV2,
    songCoverPlan,
    errors,
  };
}

export async function syncRecipeAgentArtifacts(
  supabase: SupabaseDataClient,
  input: BuildRecipeAgentArtifactSyncPlanInput,
) {
  const plan = buildRecipeAgentArtifactSyncPlan(input);

  for (const artifactRecord of plan.artifactRecords) {
    await upsertAgentArtifact(supabase, artifactRecord);
  }

  if (!plan.valid) {
    return plan;
  }

  if (plan.recipePatch) {
    await mergeVideoProjectRecipeData(supabase, input.videoId, plan.recipePatch);
  }

  const existingSegments = await listSegmentsByVideoId(supabase, input.videoId);
  const useNonDestructiveStoryboardSync = existingSegments.length > 0;

  let persistedScenes: LogicalScene[] = [];

  if (plan.logicalScenes.length > 0) {
    if (useNonDestructiveStoryboardSync) {
      persistedScenes = await upsertLogicalScenesForVideoByPosition(
        supabase,
        input.videoId,
        plan.logicalScenes,
      );
    } else {
      persistedScenes = await replaceLogicalScenesForVideo(
        supabase,
        input.videoId,
        plan.logicalScenes,
      );
    }
  }

  const segmentInputs =
    persistedScenes.length > 0
      ? remapSegmentInputsForPersistedScenes(
          plan.segments,
          persistedScenes,
          plan.agentScenePositionById,
        )
      : plan.segments;

  let persistedSegments: SeedanceSegment[] = [];

  if (segmentInputs.length > 0) {
    if (useNonDestructiveStoryboardSync) {
      persistedSegments = await upsertSegmentsForVideoByPosition(
        supabase,
        input.videoId,
        segmentInputs,
      );
    } else {
      persistedSegments = await replaceSegmentsForVideo(
        supabase,
        input.videoId,
        segmentInputs,
      );
    }

    if (persistedScenes.length > 0) {
      const segmentLinks: { sceneId: string; segmentId: string }[] = [];
      for (const segment of persistedSegments) {
        for (const sceneId of segment.logicalSceneIds) {
          segmentLinks.push({ sceneId, segmentId: segment.id });
        }
      }
      await updateLogicalSceneSegmentLinks(supabase, segmentLinks);
    }

    const segmentCountForSummary = useNonDestructiveStoryboardSync
      ? (await listSegmentsByVideoId(supabase, input.videoId)).length
      : persistedSegments.length;

    await updateVideoProjectStoryboardSummary(supabase, input.videoId, {
      source: "cursor_recipe_agent",
      logicalSceneCount: plan.logicalScenes.length,
      segmentCount: segmentCountForSummary,
      generatedAt: new Date().toISOString(),
    });
  }

  // ---------------------------------------------------------------------
  // References: resolve library vs recipe-specific, then wire to segments.
  //
  // We do this AFTER segments have been persisted because building rows in
  // `segment_references` requires the DB UUIDs returned by
  // `replaceSegmentsForVideo`. Resolution rules:
  //   - If a canonicalName matches an entry in `asset_library`, the segment
  //     is wired to `library_asset_id` and NO row is created in
  //     `reference_assets`.
  //   - Otherwise we insert a recipe-specific row in `reference_assets`
  //     and wire the segment to `recipe_reference_id`.
  // ---------------------------------------------------------------------

  const allCanonicalNames = collectCanonicalNamesForResolution(
    plan.referencesRaw,
    persistedSegments,
  );

  const libraryIndex = await findAssetLibraryByCanonicalNames(
    supabase,
    allCanonicalNames,
  );

  const recipeSpecificInputs: CreateReferenceAssetInput[] = plan.referencesRaw
    .filter((entry) => !libraryIndex.has(entry.canonicalName))
    .map((entry) => ({
      id: entry.id,
      videoId: input.videoId,
      mediaAssetId: entry.mediaAssetId ?? null,
      type: entry.type,
      canonicalName: entry.canonicalName,
      source: entry.source ?? "agent_reference_plan",
      runwayUri: entry.runwayUri ?? null,
      prompt: buildReferencePrompt(entry),
      status: entry.status ?? "planned",
      conditioningCanonicalNames: entry.conditioningReferences ?? [],
    }));

  const persistedRecipeRefs = await replaceAgentReferenceAssetsForVideo(
    supabase,
    input.videoId,
    recipeSpecificInputs,
  );

  const recipeRefIndex = new Map(
    persistedRecipeRefs.map((reference) => [reference.canonicalName, reference]),
  );

  if (persistedSegments.length > 0) {
    const mappings: SegmentReferenceMapping[] = [];

    for (const segment of persistedSegments) {
      // Track skipped references so we surface them in `plan.errors` but
      // still persist the well-formed rows: a single unresolvable reference
      // shouldn't block the rest of the storyboard's wiring.
      let position = 0;
      /** Dedup: DB enforces unique (segment_id, library_asset_id) and (segment_id, recipe_reference_id). */
      const seenTargets = new Set<string>();
      for (const segmentReference of segment.references) {
        const libraryEntry = libraryIndex.get(segmentReference.name);
        const recipeEntry = recipeRefIndex.get(segmentReference.name);

        if (!libraryEntry && !recipeEntry) {
          plan.errors.push(
            `segment '${segment.title}' (${segment.id}) references '${segmentReference.name}' which is not in asset_library nor declared in reference-plan.json.`,
          );
          continue;
        }

        const libraryAssetId = libraryEntry?.id ?? null;
        const recipeReferenceId = libraryEntry ? null : recipeEntry?.id ?? null;
        const targetKey = libraryAssetId
          ? `lib:${libraryAssetId}`
          : recipeReferenceId
            ? `recipe:${recipeReferenceId}`
            : null;

        if (targetKey && seenTargets.has(targetKey)) {
          plan.errors.push(
            `segment '${segment.title}' (${segment.id}): duplicate link to the same asset row for reference name '${segmentReference.name}' — extra row skipped (fix seedance-segments if this was unintentional).`,
          );
          continue;
        }
        if (targetKey) {
          seenTargets.add(targetKey);
        }

        mappings.push({
          segmentId: segment.id,
          libraryAssetId,
          recipeReferenceId,
          role: segmentReference.role,
          position,
          required: segmentReference.required ?? true,
        });

        position += 1;
      }
    }

    await replaceSegmentReferencesForSegments(supabase, {
      segmentIds: persistedSegments.map((segment) => segment.id),
      mappings,
    });
  }

  const sunoPatch: Record<string, unknown> = {};
  if (plan.sunoPromptV2) {
    sunoPatch.sunoPromptV2 = plan.sunoPromptV2;
    sunoPatch.sunoPromptV2SyncedAt = new Date().toISOString();
  }
  if (plan.sunoPrompt) {
    sunoPatch.sunoPrompt = plan.sunoPrompt;
    sunoPatch.sunoPromptSyncedAt = new Date().toISOString();
  }
  if (Object.keys(sunoPatch).length > 0) {
    await mergeVideoProjectRecipeData(supabase, input.videoId, sunoPatch);
  }

  if (plan.songCoverPlan) {
    const songCoverSync = await syncSongCoverPlan(supabase, {
      videoId: input.videoId,
      plan: plan.songCoverPlan,
    });

    // The Cover & Canvas tab surfaces unresolved canonical names so the
    // operator can either fix the agent plan or live with the warning
    // (manual edits in the UI still work). We do NOT block the sync on
    // these — the rows are upserted and the artifact statuses stay on
    // `planned` until the operator triggers a regen.
    for (const name of songCoverSync.unresolvedCoverConditioning) {
      plan.errors.push(
        `song-cover-plan.json: albumCover.conditioningReferences includes '${name}' which is not in asset_library nor declared in reference-plan.json.`,
      );
    }
    for (const name of songCoverSync.unresolvedCanvasImageReferences) {
      plan.errors.push(
        `song-cover-plan.json: spotifyCanvas.imageReferences includes '${name}' which is not in asset_library nor declared in reference-plan.json.`,
      );
    }
    for (const name of songCoverSync.unresolvedCanvasVideoReferences) {
      plan.errors.push(
        `song-cover-plan.json: spotifyCanvas.videoReferences includes '${name}' which is not in asset_library nor declared in reference-plan.json.`,
      );
    }
    if (songCoverSync.canvasPromptLoopWarning) {
      plan.errors.push(`song-cover-plan.json: ${songCoverSync.canvasPromptLoopWarning}`);
    }
  }

  return plan;
}

function validateSongCoverPlanArtifact(content: string): {
  value: SongCoverPlan | null;
  errors: string[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      value: null,
      errors: [
        `Invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
      ],
    };
  }

  const result = SongCoverPlanSchema.safeParse(parsed);
  if (!result.success) {
    return {
      value: null,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      ),
    };
  }
  return { value: result.data, errors: [] };
}

export function createArtifactContentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function validateSunoPromptJsonArtifact(content: string): {
  value: SunoPromptV2 | null;
  errors: string[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      value: null,
      errors: [
        `Invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
      ],
    };
  }

  const result = SunoPromptV2Schema.safeParse(parsed);
  if (!result.success) {
    return {
      value: null,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      ),
    };
  }

  return { value: result.data, errors: [] };
}

function validateArtifact(input: {
  name: string;
  content: string;
  videoId: string;
}): { value: unknown | null; errors: string[] } {
  if (input.name === "suno-prompt.md" || input.name === "decisions.md" || input.name === "changelog.md") {
    return { value: input.content, errors: [] };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(input.content);
  } catch (error) {
    return {
      value: null,
      errors: [
        `Invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
      ],
    };
  }

  const schema =
    input.name === "recipe-analysis.json"
      ? RecipeAnalysisResultSchema
      : input.name === "logical-scenes.json"
        ? LogicalScenesEnvelopeSchema
        : input.name === "seedance-segments.json"
          ? SeedanceSegmentsEnvelopeSchema
          : input.name === "reference-plan.json"
            ? ReferencePlanSchema
            : null;

  if (!schema) {
    return { value: parsed, errors: [] };
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    return {
      value: null,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      ),
    };
  }

  return { value: result.data, errors: [] };
}

function toCreateLogicalSceneInput(scene: LogicalScene): CreateLogicalSceneInput {
  return {
    position: scene.position,
    sceneType: scene.sceneType,
    arc: scene.arc,
    description: scene.description,
    bg: scene.bg ?? null,
    zoom: scene.zoom ?? null,
    durationTarget: scene.durationTarget ?? null,
    note: scene.note ?? null,
    textureCue: scene.textureCue ?? null,
    sfxCue: scene.sfxCue ?? null,
    satisfactionBeat: scene.satisfactionBeat,
    runwaySafeScore: scene.runwaySafeScore,
    segmentId: null,
  };
}

function remapSegmentInputsForPersistedScenes(
  segments: ReturnType<typeof toCreateSegmentInput>[],
  persistedScenes: LogicalScene[],
  agentScenePositionById: ReadonlyMap<string, number>,
): ReturnType<typeof toCreateSegmentInput>[] {
  const logicalSceneIdsByPosition = remapAllSegmentsLogicalSceneIdsForPersistence({
    segments: segments.map((segment) => ({
      position: segment.position,
      arc: segment.arc,
      logicalSceneIds: segment.logicalSceneIds,
    })),
    persistedScenes,
    agentScenePositionById,
  });

  return segments.map((segment) => ({
    ...segment,
    logicalSceneIds: logicalSceneIdsByPosition.get(segment.position) ?? [],
  }));
}

function toCreateSegmentInput(videoId: string, segment: SeedanceSegment) {
  return {
    videoId,
    position: segment.position,
    title: segment.title,
    arc: segment.arc,
    logicalSceneIds: segment.logicalSceneIds,
    description: segment.description,
    prompt: segment.prompt,
    promptInitial: segment.promptInitial,
    references: segment.references,
    durationTarget: segment.durationTarget,
    status: segment.status,
    createdBy: segment.createdBy ?? null,
  };
}

/**
 * Aggregate every canonical name we may need to resolve against
 * `asset_library`: those declared in `reference-plan.json` PLUS those used in
 * `segment.references[].name`. Segments can mention library assets directly
 * (e.g. "KitchenIslandDefault") without the agent re-declaring them in the
 * plan; we want those still wired through `segment_references.library_asset_id`.
 */
function collectCanonicalNamesForResolution(
  referencesRaw: ReferencePlanEntry[],
  persistedSegments: { references: { name: string }[] }[],
): string[] {
  const names = new Set<string>();
  for (const entry of referencesRaw) {
    names.add(entry.canonicalName);
  }
  for (const segment of persistedSegments) {
    for (const reference of segment.references) {
      if (reference.name) {
        names.add(reference.name);
      }
    }
  }
  return Array.from(names);
}

function buildReferencePrompt(reference: {
  role: string;
  priority?: number;
  usedInSegmentIds?: string[];
  prompt?: string | null;
}) {
  const details = [
    reference.prompt,
    `Role: ${reference.role}`,
    reference.priority == null ? null : `Priority: ${reference.priority}`,
    reference.usedInSegmentIds?.length
      ? `Used in segments: ${reference.usedInSegmentIds.join(", ")}`
      : null,
  ].filter(Boolean);

  return details.join("\n");
}
