/** Max length for `videos.title` (wizard + inline rename). */
export const MAX_VIDEO_TITLE_LENGTH = 200;

/** Max length for optional complementary instructions appended to the initial recipe agent prompt. */
export const MAX_COMPLEMENTARY_AGENT_INSTRUCTIONS_LENGTH = 8000;

export const DEFAULT_VIDEO_MODEL = "seedance2";
export const DEFAULT_IMAGE_MODEL = "gpt_image_2";
export const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";
export const DEFAULT_SFX_MODEL = "eleven_text_to_sound_v2";
export const DEFAULT_CURSOR_AGENT_MODEL = "gpt-5.5";

export const TARGET_DURATION_OPTIONS = [
  { value: "auto", label: "Auto (model decides)" },
  { value: "45", label: "45 seconds" },
  { value: "60", label: "60 seconds" },
  { value: "90", label: "90 seconds" },
] as const;

export const CURSOR_AGENT_MODEL_OPTIONS = [
  { value: "gpt-5.5", label: "GPT-5.5" },
  { value: "composer-2", label: "Composer 2" },
  { value: "composer-2.5", label: "Composer 2.5" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-opus-4-7", label: "Opus 4.7" },
  { value: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
] as const;

export const CURSOR_AGENT_REASONING_OPTIONS = {
  "gpt-5.5": [
    { value: "none", label: "None" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "extra-high", label: "Extra High" },
  ],
  "composer-2": [],
  "composer-2.5": [],
  "claude-sonnet-4-6": [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "max", label: "Max" },
  ],
  "claude-opus-4-7": [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra High" },
    { value: "max", label: "Max" },
  ],
  "gemini-3.1-pro": [],
} as const;

export const CURSOR_AGENT_FAST_BY_MODEL = {
  "gpt-5.5": "false",
  "composer-2": "true",
  "composer-2.5": "true",
  "claude-sonnet-4-6": "false",
  "claude-opus-4-7": "false",
  "gemini-3.1-pro": "false",
} as const;

export const CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL = {
  "gpt-5.5": "high",
  "composer-2": undefined,
  "composer-2.5": undefined,
  "claude-sonnet-4-6": "medium",
  "claude-opus-4-7": "high",
  "gemini-3.1-pro": undefined,
} as const;

export const STYLE_PRESET_OPTIONS = [
  { value: "asmr_food", label: "ASMR food" },
  { value: "playful_mascot", label: "Playful mascot" },
  { value: "dramatic_texture", label: "Dramatic texture" },
  { value: "clean_instructional", label: "Clean instructional" },
] as const;

// During the hackathon the segment generation workflow only supports
// `seedance2` (see `assertSeedance2Selected` in
// `modules/generation/use-cases/orchestrate-segment-generation.ts`). Exposing
// other models in the wizard would let users save a project that the workflow
// later refuses to generate. When more endpoints are wired (gen4.5 etc.),
// re-add their entries here AND in the workflow contract.
export const VIDEO_MODEL_OPTIONS = [
  { value: "seedance2", label: "Seedance 2" },
] as const;

export const IMAGE_MODEL_OPTIONS = [
  { value: "gpt_image_2", label: "GPT-Image 2" },
  { value: "gen4_image", label: "Gen-4 Image" },
  { value: "gen4_image_turbo", label: "Gen-4 Image Turbo" },
] as const;

export const TTS_MODEL_OPTIONS = [
  { value: "eleven_multilingual_v2", label: "Eleven Multilingual v2" },
] as const;

export const SFX_MODEL_OPTIONS = [
  { value: "eleven_text_to_sound_v2", label: "Eleven Text to Sound v2" },
] as const;

export const MAX_RECIPE_SOURCE_FILE_SIZE_BYTES = 16 * 1024 * 1024;
export const RECIPE_SOURCE_BUCKET = "recipe-sources";
