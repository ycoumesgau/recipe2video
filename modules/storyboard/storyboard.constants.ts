export const OPENAI_REASONING_MODEL = "GPT-5.5 High";

export const DEFAULT_SEEDANCE_VIDEO_MODEL = "seedance2";
export const DEFAULT_VERTICAL_RATIO = "720:1280";
export const MAX_SEEDANCE_REFERENCES = 9;
export const MIN_LOGICAL_SCENES = 30;
export const MAX_LOGICAL_SCENES = 48;
export const TARGET_SEEDANCE_SEGMENT_COUNT = 5;

export const FOOD_VIDEO_PROMPT_RULES = [
  "Open with a 2-3 scene texture-first micro-arc and immediate payoff.",
  "Add a texture payoff or strong material contrast every 3-5 logical scenes.",
  "Use English Seedance prompts with explicit reference roles.",
  "Compress logical scenes into fewer multi-shot Seedance segments.",
  "Specify hard cuts, mandatory timing, total duration, and kitchen ASMR only.",
  "Do not request speech, voiceover, or music in video generation prompts.",
  "Keep no more than 9 references per Seedance segment.",
  "Include a global Licorn kitchen reference when generation references exist.",
  "Describe fragile food physics and non-standard geometry explicitly.",
  "End with the finished dish in the Licorn kitchen with the character visible and satisfied.",
] as const;
