export const OPENAI_REASONING_MODEL = "GPT-5.5 High";

export const DEFAULT_SEEDANCE_VIDEO_MODEL = "seedance2";
export const DEFAULT_VERTICAL_RATIO = "720:1280";
export const MAX_SEEDANCE_REFERENCES = 9;
export const MAX_SEEDANCE_PROMPT_CHARACTERS = 3500;
export const MIN_LOGICAL_SCENES = 30;
export const MAX_LOGICAL_SCENES = 48;
export const TARGET_SEEDANCE_SEGMENT_COUNT = 8;

export const VIDEOS_REPO_POLICY_SOURCES = [
  "videos/.cursor/rules/system-prompt.mdc",
  "videos/.cursor/rules/food-video-constraints.mdc",
  "videos/.cursor/rules/recipe-output-format.mdc",
  "videos/.cursor/skills/recipe-ingest/SKILL.md",
  "videos/.cursor/skills/scene-expansion/SKILL.md",
  "videos/.cursor/skills/seedance-workflow/SKILL.md",
  "videos/.cursor/skills/asset-reference-system/SKILL.md",
  "videos/.cursor/skills/food-physics-reference/SKILL.md",
  "videos/.cursor/skills/tiktok-food-direction/SKILL.md",
  "videos/.cursor/skills/runway-generation-reference/SKILL.md",
  "videos/.cursor/agents/recipe-researcher.md",
  "videos/.cursor/agents/format-researcher.md",
  "videos/.cursor/agents/scene-verifier.md",
] as const;

export const FOOD_VIDEO_PROMPT_RULES = [
  "Preserve the videos repo workflow: sequencage first, user validation, scene/prompt expansion later.",
  "Open with a 2-3 scene texture-first micro-arc and immediate payoff.",
  "Default opening is a tight character context shot that launches a visually sexy gesture, followed by the detail payoff of the same gesture.",
  "Never hook on final-product slicing or ingredients simply lined up on the counter.",
  "Keep approximately 70-80% detail shots and 20-30% context shots.",
  "Each logical scene must be readable as a still image, animated by one main motion, and bruitable by one dominant sound.",
  "Add a texture payoff or strong material contrast every 3-5 logical scenes.",
  "Context shots are allowed only when they prepare the next detail shot.",
  "Use canonical kitchen backgrounds and utensil identifiers from the videos asset reference system.",
  "Do not redescribe the mascot; preserve character identity from references and show hands for human actions.",
  "For induction shots, explicitly forbid flames, red or blue glow, and heat halos.",
  "For oven shots, separate loading and reveal; do not combine door open or close with another action.",
  "Use English Seedance prompts with explicit reference roles.",
  "Seedance production uses References mode by default; do not mix it with Start/End frames.",
  "Compress logical scenes into fewer multi-shot Seedance segments.",
  "Specify hard cuts, mandatory timing, total duration, and kitchen ASMR only.",
  "Do not request speech, voiceover, or music in video generation prompts.",
  "Keep no more than 9 references per Seedance segment.",
  "Include a global Licorn kitchen reference when generation references exist.",
  "Describe fragile food physics and non-standard geometry explicitly.",
  "For non-standard shapes, describe what the dish is and what it is not.",
  "For repetitive structures, lock visible count/topology or require target state frames.",
  "For baking, raising, cracking, or filled-state transformations that change geometry, prefer raw/baked/filled/finished target frames and hard cuts.",
  "End with the finished dish in the Licorn kitchen with the character visible and satisfied.",
] as const;

export const SEEDANCE_PROMPT_SKELETON = [
  "Use @... for [role]. Use @... only as [role].",
  "Use @KitchenIslandDefault to preserve kitchen identity, materials and lighting without copying exact framing.",
  "Generate exactly N short shots with hard cuts, total duration X seconds, no slow motion, no soft transitions, no extra shots.",
  "TikTok/Reels food ASMR style, no text on screen.",
  "Integrated audio: no speech, no voiceover, no music. Only close-up kitchen ASMR sounds synchronized with cuts and food actions.",
  "Mandatory timing: one bullet per shot with precise time ranges.",
  "Global negatives: short list of the most likely failures.",
  "Mandatory audio: time-aligned ASMR events.",
] as const;

export const RUNWAY_SAFE_SCENE_CHECKS = [
  "Image fixe",
  "Mouvement",
  "SFX",
  "Désir visuel",
  "Contraste texture",
] as const;
