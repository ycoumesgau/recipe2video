export type SunoMarkdownSections = {
  preamble: string;
  styleOfMusic: string;
  excludeStyles: string;
  title: string;
  autoLyricsPrompt: string;
  shortVersionPlan: string;
};

export type ParsedSunoMarkdown = {
  sections: SunoMarkdownSections;
  /** Prefer section cards when we extracted meaningful Suno fields. */
  useSectionCards: boolean;
  rawMarkdown: string;
};

const PREAMBLE_KEY = "__preamble__";

function stripCodeFence(body: string): string {
  const trimmed = body.trim();
  const block = trimmed.match(/^```(?:text)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (block) {
    return block[1].trim();
  }
  const inline = trimmed.match(/```(?:text)?\s*\n?([\s\S]*?)\n?```/i);
  if (inline) {
    return inline[1].trim();
  }
  return trimmed;
}

function classifySectionTitle(title: string): keyof Omit<SunoMarkdownSections, "preamble"> | null {
  const t = title.trim().toLowerCase();
  if (t.includes("style of music")) {
    return "styleOfMusic";
  }
  if (t.includes("exclude")) {
    return "excludeStyles";
  }
  if (t === "title" || t.startsWith("title ")) {
    return "title";
  }
  if (t.includes("auto lyrics") || t.includes("lyrics prompt")) {
    return "autoLyricsPrompt";
  }
  if (t.includes("short version")) {
    return "shortVersionPlan";
  }
  return null;
}

function emptySections(): SunoMarkdownSections {
  return {
    preamble: "",
    styleOfMusic: "",
    excludeStyles: "",
    title: "",
    autoLyricsPrompt: "",
    shortVersionPlan: "",
  };
}

/**
 * Parses agent-style `suno-prompt.md` into the five Suno Custom Mode fields.
 * Tolerates missing ``` fences, reordered sections, and stray headings.
 */
export function parseSunoMarkdownForAssembly(markdown: string): ParsedSunoMarkdown {
  const rawMarkdown = markdown;
  const sections = emptySections();
  const lines = markdown.split(/\r?\n/);
  let currentTitle = PREAMBLE_KEY;
  const currentBody: string[] = [];

  function flush() {
    const body = currentBody.join("\n").trim();
    const cleaned = stripCodeFence(body);
    if (currentTitle === PREAMBLE_KEY) {
      sections.preamble = cleaned;
      return;
    }
    const key = classifySectionTitle(currentTitle);
    if (key) {
      sections[key] = cleaned;
      return;
    }
    const chunk = [`## ${currentTitle}`, body].filter(Boolean).join("\n\n").trim();
    sections.preamble = sections.preamble ? `${sections.preamble}\n\n${chunk}` : chunk;
  }

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      flush();
      currentTitle = heading[1].trim();
      currentBody.length = 0;
    } else {
      currentBody.push(line);
    }
  }
  flush();

  const mainChars =
    sections.styleOfMusic.length +
    sections.excludeStyles.length +
    sections.title.length +
    sections.autoLyricsPrompt.length +
    sections.shortVersionPlan.length;

  const filledMainFields = [
    sections.styleOfMusic,
    sections.excludeStyles,
    sections.title,
    sections.autoLyricsPrompt,
    sections.shortVersionPlan,
  ].filter((value) => value.trim().length > 0).length;

  const useSectionCards =
    mainChars >= 40 ||
    filledMainFields >= 2 ||
    (filledMainFields >= 1 && sections.autoLyricsPrompt.length >= 80);

  return {
    sections,
    useSectionCards,
    rawMarkdown,
  };
}

export function buildNormalizedMarkdownPack(sections: SunoMarkdownSections): string {
  const parts: string[] = [];
  if (sections.preamble.trim()) {
    parts.push(sections.preamble.trim());
  }
  const blocks: [string, string][] = [
    ["Style of Music", sections.styleOfMusic],
    ["Exclude Styles", sections.excludeStyles],
    ["Title", sections.title],
    ["Auto Lyrics Prompt", sections.autoLyricsPrompt],
    ["Short Version To Extract Later", sections.shortVersionPlan],
  ];
  for (const [label, body] of blocks) {
    if (!body.trim()) {
      continue;
    }
    parts.push(`## ${label}\n\n\`\`\`text\n${body.trim()}\n\`\`\``);
  }
  return parts.join("\n\n");
}
