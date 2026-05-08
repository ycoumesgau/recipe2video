export const DEFAULT_VIDEO_MODEL = "seedance2";
export const DEFAULT_IMAGE_MODEL = "gpt_image_2";
export const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";
export const DEFAULT_SFX_MODEL = "eleven_text_to_sound_v2";

export const TARGET_DURATION_OPTIONS = [
  { value: "45", label: "45 seconds" },
  { value: "60", label: "60 seconds" },
  { value: "90", label: "90 seconds" },
] as const;

export const STYLE_PRESET_OPTIONS = [
  { value: "asmr_food", label: "ASMR food" },
  { value: "playful_mascot", label: "Playful mascot" },
  { value: "dramatic_texture", label: "Dramatic texture" },
  { value: "clean_instructional", label: "Clean instructional" },
] as const;

export const VIDEO_MODEL_OPTIONS = [
  { value: "seedance2", label: "Seedance 2" },
  { value: "gen4.5", label: "Gen-4.5" },
  { value: "gen4_turbo", label: "Gen-4 Turbo" },
  { value: "veo3.1_fast", label: "Veo 3.1 Fast" },
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
