import {
  CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL,
  CURSOR_AGENT_MODEL_OPTIONS,
  CURSOR_AGENT_REASONING_OPTIONS,
  DEFAULT_CURSOR_AGENT_MODEL,
} from "./video.constants";
import type { RecipeData, VideoProductionDefaults } from "./video.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse `videos.recipe_data.productionDefaults` saved at draft creation.
 */
export function getProductionDefaultsFromRecipeData(
  recipeData: RecipeData | null | undefined,
): VideoProductionDefaults | null {
  if (!recipeData || !isRecord(recipeData)) {
    return null;
  }

  const raw = recipeData.productionDefaults;
  if (!isRecord(raw)) {
    return null;
  }

  const stylePreset =
    typeof raw.stylePreset === "string" ? raw.stylePreset : undefined;
  const videoModel =
    typeof raw.videoModel === "string" ? raw.videoModel : undefined;
  const imageModel =
    typeof raw.imageModel === "string" ? raw.imageModel : undefined;
  const ttsModel = typeof raw.ttsModel === "string" ? raw.ttsModel : undefined;
  const sfxModel = typeof raw.sfxModel === "string" ? raw.sfxModel : undefined;

  if (!stylePreset || !videoModel || !imageModel || !ttsModel || !sfxModel) {
    return null;
  }

  const targetDurationSeconds =
    typeof raw.targetDurationSeconds === "number"
      ? raw.targetDurationSeconds
      : undefined;

  return {
    stylePreset,
    videoModel,
    imageModel,
    ttsModel,
    sfxModel,
    targetDurationSeconds,
    cursorAgentModel:
      typeof raw.cursorAgentModel === "string"
        ? raw.cursorAgentModel
        : undefined,
    cursorAgentReasoning:
      typeof raw.cursorAgentReasoning === "string"
        ? raw.cursorAgentReasoning
        : undefined,
    cursorAgentFast:
      typeof raw.cursorAgentFast === "string" ? raw.cursorAgentFast : undefined,
  };
}

export function formatCursorAgentModelLabel(modelValue: string): string {
  return (
    CURSOR_AGENT_MODEL_OPTIONS.find((option) => option.value === modelValue)
      ?.label ?? modelValue
  );
}

const CURSOR_AGENT_REASONING_NOT_CONFIGURABLE =
  "Not configurable for this model";

/**
 * Human-readable reasoning level for the overview, aligned with the new-video wizard.
 */
export function formatCursorAgentReasoningLabel(
  modelValue: string,
  reasoningValue?: string,
): string {
  const reasoningOptions =
    CURSOR_AGENT_REASONING_OPTIONS[
      modelValue as keyof typeof CURSOR_AGENT_REASONING_OPTIONS
    ] ?? [];

  if (reasoningOptions.length === 0) {
    return CURSOR_AGENT_REASONING_NOT_CONFIGURABLE;
  }

  const resolvedReasoning =
    reasoningValue ??
    CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL[
      modelValue as keyof typeof CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL
    ] ??
    reasoningOptions[0]?.value;

  if (!resolvedReasoning) {
    return CURSOR_AGENT_REASONING_NOT_CONFIGURABLE;
  }

  return (
    reasoningOptions.find((option) => option.value === resolvedReasoning)
      ?.label ?? resolvedReasoning
  );
}

export interface CursorAgentSelectionDisplay {
  modelValue: string;
  modelLabel: string;
  reasoningLabel: string;
}

/**
 * Cursor agent model + reasoning for project overview (from draft `productionDefaults`).
 */
export function getCursorAgentSelectionDisplay(
  recipeData: RecipeData | null | undefined,
): CursorAgentSelectionDisplay | null {
  const defaults = getProductionDefaultsFromRecipeData(recipeData);
  if (!defaults) {
    return null;
  }

  const modelValue =
    defaults.cursorAgentModel?.trim() || DEFAULT_CURSOR_AGENT_MODEL;

  return {
    modelValue,
    modelLabel: formatCursorAgentModelLabel(modelValue),
    reasoningLabel: formatCursorAgentReasoningLabel(
      modelValue,
      defaults?.cursorAgentReasoning,
    ),
  };
}
