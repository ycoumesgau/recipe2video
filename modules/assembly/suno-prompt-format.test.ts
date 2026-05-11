import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNormalizedMarkdownPack,
  parseSunoMarkdownForAssembly,
} from "./suno-prompt-format";

const parisBrestTemplate = `# Suno Prompt — Paris-Brest

## Style of Music

\`\`\`text
K-pop electronic pop with crisp four-on-the-floor kicks.
\`\`\`

## Exclude Styles

\`\`\`text
No aggressive rap, no metal.
\`\`\`

## Title

\`\`\`text
Praline Crown
\`\`\`

## Auto Lyrics Prompt

\`\`\`text
Write original English song lyrics about a joyful unicorn.
Must include naturally: Paris-Brest, unicorn.
\`\`\`

## Short Version To Extract Later

Use a short intro, Verse 1, then final chorus over the hero shot.`;

test("parseSunoMarkdownForAssembly extracts all five fields from the template", () => {
  const parsed = parseSunoMarkdownForAssembly(parisBrestTemplate);
  assert.equal(parsed.useSectionCards, true);
  assert.match(parsed.sections.preamble, /Paris-Brest/);
  assert.match(parsed.sections.styleOfMusic, /K-pop electronic pop/);
  assert.match(parsed.sections.excludeStyles, /No aggressive rap/);
  assert.equal(parsed.sections.title.trim(), "Praline Crown");
  assert.match(parsed.sections.autoLyricsPrompt, /unicorn/);
  assert.match(parsed.sections.shortVersionPlan, /hero shot/);
});

test("parseSunoMarkdownForAssembly tolerates missing fences and reordered sections", () => {
  const md = `## Title
Just a working title

## Style of Music
plain text style without fence

## Auto Lyrics Prompt
Sing about butter.

## Exclude Styles

## Short Version To Extract Later
Cut to chorus for TikTok.`;

  const parsed = parseSunoMarkdownForAssembly(md);
  assert.equal(parsed.sections.title, "Just a working title");
  assert.equal(parsed.sections.styleOfMusic, "plain text style without fence");
  assert.equal(parsed.sections.autoLyricsPrompt, "Sing about butter.");
  assert.equal(parsed.sections.excludeStyles, "");
  assert.match(parsed.sections.shortVersionPlan, /TikTok/);
  assert.equal(parsed.useSectionCards, true);
});

test("parseSunoMarkdownForAssembly marks freeform markdown as raw when nothing matches", () => {
  const md = "Just a paragraph with no headings at all.";
  const parsed = parseSunoMarkdownForAssembly(md);
  assert.equal(parsed.useSectionCards, false);
  assert.equal(parsed.sections.preamble, "Just a paragraph with no headings at all.");
});

test("buildNormalizedMarkdownPack skips empty sections", () => {
  const pack = buildNormalizedMarkdownPack({
    preamble: "",
    styleOfMusic: "A",
    excludeStyles: "",
    title: "T",
    autoLyricsPrompt: "",
    shortVersionPlan: "S",
  });
  assert.match(pack, /## Style of Music/);
  assert.match(pack, /## Title/);
  assert.match(pack, /## Short Version/);
  assert.doesNotMatch(pack, /## Exclude Styles/);
});
