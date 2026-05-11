"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";

import { parseAliasesFromFreeText } from "./library.validation";
import { createLibraryAsset } from "./use-cases/create-library-asset";
import { regenerateAssetReferenceSkill } from "./use-cases/regenerate-asset-reference-skill";
import { replaceLibraryAssetMedia } from "./use-cases/replace-library-asset-media";
import { setLibraryAssetStatus } from "./use-cases/set-library-asset-status";
import { updateLibraryAssetMetadata } from "./use-cases/update-library-asset-metadata";

const LIBRARY_PATH = "/library";

export async function createLibraryAssetAction(formData: FormData) {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("Choose a PNG file before creating a library asset.");
    }

    const result = await createLibraryAsset(createSupabaseAdminClient(), {
      file,
      canonicalName: requireString(formData, "canonicalName"),
      category: requireString(formData, "category"),
      aliases: parseAliasesFromFreeText(getString(formData, "aliases")),
      description: getString(formData, "description") || null,
      createdBy: profile.id,
    });

    revalidatePath(LIBRARY_PATH);
    redirectWithNotice(
      "success",
      formatNotice(
        `Library asset '${result.entry.canonicalName}' created.`,
        result.skill,
      ),
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice("error", getActionErrorMessage(error));
  }
}

export async function replaceLibraryAssetMediaAction(formData: FormData) {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("Choose a PNG file before replacing the image.");
    }

    const entry = await replaceLibraryAssetMedia(createSupabaseAdminClient(), {
      assetLibraryId: requireString(formData, "assetLibraryId"),
      file,
      createdBy: profile.id,
    });

    revalidatePath(LIBRARY_PATH);
    redirectWithNotice(
      "success",
      `Library asset '${entry.canonicalName}' image replaced.`,
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice("error", getActionErrorMessage(error));
  }
}

export async function updateLibraryAssetMetadataAction(formData: FormData) {
  try {
    await assertCostlyActionAllowed();

    const result = await updateLibraryAssetMetadata(
      createSupabaseAdminClient(),
      {
        assetLibraryId: requireString(formData, "assetLibraryId"),
        category: getString(formData, "category") || undefined,
        aliases: parseAliasesFromFreeText(getString(formData, "aliases")),
        description: formData.has("description")
          ? getString(formData, "description") || null
          : undefined,
      },
    );

    revalidatePath(LIBRARY_PATH);
    redirectWithNotice(
      "success",
      formatNotice(
        `Library asset '${result.entry.canonicalName}' metadata updated.`,
        result.skill,
      ),
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice("error", getActionErrorMessage(error));
  }
}

export async function deprecateLibraryAssetAction(formData: FormData) {
  try {
    await assertCostlyActionAllowed();
    const result = await setLibraryAssetStatus(createSupabaseAdminClient(), {
      assetLibraryId: requireString(formData, "assetLibraryId"),
      status: "deprecated",
    });

    revalidatePath(LIBRARY_PATH);
    redirectWithNotice(
      "success",
      formatNotice(
        `Library asset '${result.entry.canonicalName}' deprecated.`,
        result.skill,
      ),
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice("error", getActionErrorMessage(error));
  }
}

export async function reactivateLibraryAssetAction(formData: FormData) {
  try {
    await assertCostlyActionAllowed();
    const result = await setLibraryAssetStatus(createSupabaseAdminClient(), {
      assetLibraryId: requireString(formData, "assetLibraryId"),
      status: "active",
    });

    revalidatePath(LIBRARY_PATH);
    redirectWithNotice(
      "success",
      formatNotice(
        `Library asset '${result.entry.canonicalName}' reactivated.`,
        result.skill,
      ),
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice("error", getActionErrorMessage(error));
  }
}

export async function republishAssetReferenceSkillAction() {
  try {
    await assertCostlyActionAllowed();
    const result = await regenerateAssetReferenceSkill(
      createSupabaseAdminClient(),
      { reason: "manual republish from /library" },
    );
    revalidatePath(LIBRARY_PATH);
    redirectWithNotice(
      result.pushStatus === "failed" ? "error" : "success",
      formatSkillPushOutcome(result),
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirectWithNotice("error", getActionErrorMessage(error));
  }
}

function formatNotice(
  message: string,
  skill: Awaited<ReturnType<typeof regenerateAssetReferenceSkill>>,
): string {
  return `${message} ${formatSkillPushOutcome(skill)}`;
}

function formatSkillPushOutcome(
  skill: Awaited<ReturnType<typeof regenerateAssetReferenceSkill>>,
): string {
  switch (skill.pushStatus) {
    case "committed":
      return `Skill committed${skill.commitSha ? ` (${skill.commitSha.slice(0, 7)})` : ""}.`;
    case "unchanged":
      return "Skill already up to date.";
    case "skipped":
      return `Skill not pushed: ${skill.skippedReason ?? "skipped"}.`;
    case "failed":
      return `Skill push failed: ${skill.error ?? "unknown error"}.`;
  }
}

function redirectWithNotice(type: "success" | "error", message: string): never {
  redirect(
    `${LIBRARY_PATH}?notice=${type}&message=${encodeURIComponent(message)}`,
  );
}

function getActionErrorMessage(error: unknown) {
  if (isAuthAccessError(error)) {
    return error.code === "unauthenticated"
      ? "Authentication is required before editing the library."
      : "This user is not authorized to edit the library.";
  }
  return error instanceof Error ? error.message : "Library action failed.";
}

function requireString(formData: FormData, key: string) {
  const value = getString(formData, key);
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isNextRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}
