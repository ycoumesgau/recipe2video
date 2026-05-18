import type {
  LogicalScene,
  SegmentReference,
  SeedancePromptQa,
} from "./storyboard.types";

export interface FixtureLogicalScene
  extends Omit<LogicalScene, "id" | "videoId" | "segmentId"> {
  segmentKey: string;
}

export interface FixtureSeedanceSegment {
  key: string;
  position: number;
  title: string;
  arc: string;
  logicalScenePositions: number[];
  description: string;
  prompt: string;
  references: SegmentReference[];
  durationTarget: number;
}

export interface StoryboardFixture {
  logicalScenes: FixtureLogicalScene[];
  seedanceSegments: FixtureSeedanceSegment[];
}

export function getParisBrestStoryboardFixture(): StoryboardFixture {
  const logicalScenes = buildLogicalScenes();
  const seedanceSegments = buildSeedanceSegments(logicalScenes);

  return { logicalScenes, seedanceSegments };
}

export function buildFixturePromptQa(
  prompt: string,
  references: SegmentReference[],
): SeedancePromptQa {
  return {
    referencesWithinLimit: references.length <= 9,
    globalKitchenReferencePresent: references.some(
      (reference) => reference.label === "KitchenIslandDefault",
    ),
    referenceRolesExplicit: references.every((reference) => reference.role.length > 0),
    promptWithinPracticalLimit: prompt.length <= 3500,
    hardCutsSpecified: prompt.includes("hard cuts"),
    mandatoryTimingSpecified: prompt.includes("Mandatory timing"),
    noSpeechVoiceoverOrMusic:
      prompt.includes("no speech") &&
      prompt.includes("no voiceover") &&
      prompt.includes("no music"),
    fragileFoodPhysicsHandled: prompt.includes("fragile"),
    nonStandardGeometryHandled: prompt.includes("not a smooth ring"),
    sourcePoliciesApplied: ["fixture:paris-brest-public-safe"],
  };
}

function buildLogicalScenes(): FixtureLogicalScene[] {
  return [
    scene(1, "opening", "detail", "texture hook", "Amber praline cracks into brittle glass shards under the Licorn rolling pin.", "macro top-down", "brittle crack payoff"),
    scene(2, "opening", "context", "texture hook", "Licorn reacts at the kitchen island while shards scatter beside toasted hazelnuts.", "medium kitchen", "micro-arc character anchor"),
    scene(3, "opening", "detail", "texture hook", "Warm praline blends into a glossy ribbon with a thick ASMR whirl.", "macro bowl", "immediate texture payoff"),
    scene(4, "choux", "detail", "setup and preparation", "Butter melts into water and salt on induction with no flame or glow.", "close pan", "induction must stay clean"),
    scene(5, "choux", "detail", "setup and preparation", "Flour falls in one shot and turns the pan into a thick paste.", "macro pan", "single transformation"),
    scene(6, "choux", "context", "setup and preparation", "Licorn folds the panade confidently at the island, hands visible.", "medium kitchen", "context prepares egg mixing"),
    scene(7, "choux", "detail", "setup and preparation", "Eggs blend into glossy choux paste with elastic ribbons stretching from the silicone spatula.", "macro bowl", "texture contrast"),
    scene(8, "choux", "detail", "setup and preparation", "Piping bag fills with choux paste, the nozzle kept clean and centered.", "macro bag", "tool readability"),
    scene(9, "choux", "detail", "setup and preparation", "A dotted Paris-Brest crown is piped as separate domes touching in a ring, not a smooth ring.", "top-down tray", "geometry lock"),
    scene(10, "choux", "context", "setup and preparation", "Licorn slides the tray toward the oven, crown topology still visible.", "medium oven", "oven loading separated"),
    scene(11, "choux", "detail", "transformation and assembly", "Oven reveal: puffed golden choux domes appear crisp and airy.", "close oven", "bake reveal only"),
    scene(12, "choux", "detail", "transformation and assembly", "The baked crown cools on a rack with crisp ridges and hollow structure.", "macro rack", "texture checkpoint"),
    scene(13, "cream", "detail", "transformation and assembly", "Cold cream pours into a bowl and catches light as a dense white ribbon.", "macro bowl", "smooth cream setup"),
    scene(14, "cream", "detail", "transformation and assembly", "Praline folds into cream, making beige satin streaks.", "macro whisk", "material contrast"),
    scene(15, "cream", "context", "transformation and assembly", "Licorn steadies the mixer bowl while the cream thickens.", "medium kitchen", "hands visible"),
    scene(16, "cream", "detail", "transformation and assembly", "The praline cream holds a firm peak on the whisk without collapsing.", "macro whisk", "readiness status"),
    scene(17, "assembly", "detail", "transformation and assembly", "The choux crown is sliced open on a clean horizontal axis, preserving the domed ring.", "macro board", "cut precision"),
    scene(18, "assembly", "detail", "transformation and assembly", "The top lid lifts away, exposing the hollow golden interior.", "macro hands", "fragile geometry"),
    scene(19, "assembly", "detail", "transformation and assembly", "Praline cream pipes into the base as separate ridged rosettes.", "macro piping", "topology lock"),
    scene(20, "assembly", "context", "transformation and assembly", "Licorn turns the board slightly to inspect the filled crown.", "medium island", "context before closing"),
    scene(21, "assembly", "detail", "transformation and assembly", "The top crown returns onto the cream with a soft precise press.", "macro hands", "avoid collapse"),
    scene(22, "finish", "detail", "finishing and reveal", "Powdered sugar falls as a fine white cloud over the ridged choux.", "macro sugar", "texture payoff"),
    scene(23, "finish", "detail", "finishing and reveal", "A thin praline ribbon drizzles over one side without hiding the crown shape.", "macro drizzle", "gloss contrast"),
    scene(24, "finish", "context", "finishing and reveal", "Licorn presents the Paris-Brest on the kitchen island, character visible.", "medium hero prep", "hero setup"),
    scene(25, "finish", "detail", "finishing and reveal", "Knife touches one slice point and reveals cream layers without crushing the ring.", "macro knife", "cut state"),
    scene(26, "finish", "detail", "finishing and reveal", "The slice separates cleanly, showing airy choux, praline cream, and crisp top.", "macro slice", "payoff"),
    scene(27, "finish", "context", "finishing and reveal", "Licorn leans in satisfied as the plated slice sits beside the full crown.", "medium island", "satisfaction beat"),
    scene(28, "finish", "detail", "hero payoff", "Close detail of cream ridges, sugar dust, and golden choux texture.", "macro hero", "final texture cadence"),
    scene(29, "finish", "context", "hero payoff", "Finished Paris-Brest hero shot in the Licorn kitchen with the mascot smiling.", "vertical hero", "contract final shot"),
    scene(30, "finish", "detail", "hero payoff", "Final fork pull reveals soft cream and crisp pastry crumbs in one clean motion.", "macro final bite", "closing ASMR"),
  ];
}

function buildSeedanceSegments(
  logicalScenes: FixtureLogicalScene[],
): FixtureSeedanceSegment[] {
  return [
    segment(logicalScenes, "opening", 1, "Texture-first praline hook", "texture hook", [1, 2, 3], 6),
    segment(logicalScenes, "choux-setup", 2, "Choux paste and piping", "setup and preparation", [4, 5, 6, 7, 8, 9, 10], 12),
    segment(logicalScenes, "choux-bake", 3, "Bake reveal and cooling", "transformation and assembly", [11, 12], 5),
    segment(logicalScenes, "cream", 4, "Praline cream texture", "transformation and assembly", [13, 14, 15, 16], 8),
    segment(logicalScenes, "assembly", 5, "Cut, fill, and close crown", "transformation and assembly", [17, 18, 19, 20, 21], 10),
    segment(logicalScenes, "finish", 6, "Finish and hero payoff", "finishing and reveal", [22, 23, 24, 25, 26, 27, 28, 29, 30], 15),
  ];
}

function scene(
  position: number,
  segmentKey: string,
  sceneType: "detail" | "context",
  arc: string,
  description: string,
  zoom: string,
  note: string,
): FixtureLogicalScene {
  return {
    segmentKey,
    position,
    sceneType,
    arc,
    description,
    bg: "Licorn kitchen island",
    zoom,
    durationTarget: 2,
    note,
  };
}

function segment(
  logicalScenes: FixtureLogicalScene[],
  key: string,
  position: number,
  title: string,
  arc: string,
  logicalScenePositions: number[],
  durationTarget: number,
): FixtureSeedanceSegment {
  const scenes = logicalScenes.filter((scene) =>
    logicalScenePositions.includes(scene.position),
  );
  const references = buildReferences(key);
  const prompt = buildPrompt(title, scenes, references, durationTarget);

  return {
    key,
    position,
    title,
    arc,
    logicalScenePositions,
    description: scenes.map((scene) => scene.description).join(" "),
    prompt,
    references,
    durationTarget,
  };
}

function buildReferences(key: string): SegmentReference[] {
  return [
    {
      id: `${key}-kitchen`,
      role: "global Licorn kitchen environment",
      name: "KitchenIslandDefault",
      label: "KitchenIslandDefault",
      runwayUri: null,
      required: true,
    },
    {
      id: `${key}-mascot`,
      role: "Licorn mascot cook with consistent body and hands",
      name: "LicornMascot",
      label: "LicornMascot",
      runwayUri: null,
      required: true,
    },
    {
      id: `${key}-food-state`,
      role: "Paris-Brest food state for this segment",
      name: "ParisBrestState",
      label: "ParisBrestState",
      runwayUri: null,
      required: true,
    },
  ];
}

function buildPrompt(
  title: string,
  scenes: FixtureLogicalScene[],
  references: SegmentReference[],
  durationTarget: number,
) {
  const shotDuration = Number((durationTarget / scenes.length).toFixed(1));
  const timing = scenes.map((scene, index) => {
    const start = Number((index * shotDuration).toFixed(1));
    const end = index === scenes.length - 1 ? durationTarget : Number(((index + 1) * shotDuration).toFixed(1));

    return `${start.toFixed(1)}-${end.toFixed(1)}s: ${scene.description}`;
  });

  return [
    references.map((reference) => `Use @${reference.label} only as ${reference.role}.`).join(" "),
    `Generate ${title} as exactly ${scenes.length} short shots with hard cuts, total duration ${durationTarget} seconds, no slow motion, no soft transitions, no extra shots.`,
    "Vertical TikTok/Reels food ASMR style, no text on screen.",
    "Integrated audio: no speech, no voiceover, no music. Only close-up kitchen ASMR sounds synchronized with cuts and food actions.",
    "Preserve Paris-Brest as separate piped choux domes touching in a crown, not a smooth ring; handle fragile geometry with hard cuts.",
    "Mandatory timing:",
    ...timing.map((line) => `- ${line}`),
    "Global negatives: no flames, no red or blue induction glow, no deformed character, no floating utensils, no unstable pastry geometry.",
  ].join("\n");
}
