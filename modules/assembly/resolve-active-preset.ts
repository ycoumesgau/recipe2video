import type { AssemblyPreset } from "./assembly.types";

export function resolveActivePreset(
  presets: AssemblyPreset[],
  requestedPresetId?: string | null,
): AssemblyPreset | null {
  if (presets.length === 0) {
    return null;
  }
  if (requestedPresetId) {
    const match = presets.find((preset) => preset.id === requestedPresetId);
    if (match) {
      return match;
    }
  }
  return presets[0] ?? null;
}
