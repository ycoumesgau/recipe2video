"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Copy } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";

import type { SunoPromptV2 } from "@/modules/recipe-agent/suno-prompt-v2.schema";
import { buildMarkdownPackFromV2 } from "@/modules/recipe-agent/suno-prompt-v2.schema";

import type { SunoAssemblyPromptView } from "../suno-assembly-prompt";
import { buildNormalizedMarkdownPack } from "../suno-prompt-format";

/** Field cards that use expand/collapse (title is always expanded in the UI). */
const SUNO_MARKDOWN_ACCORDION_FIELD_IDS = ["style", "exclude", "lyrics", "short"] as const;

type SunoPromptAccordionContextValue = {
  isFieldOpen: (id: string) => boolean;
  setFieldOpen: (id: string, open: boolean) => void;
  expandAllFields: () => void;
  collapseAllFields: () => void;
  allFieldsExpanded: boolean;
  allFieldsCollapsed: boolean;
  fieldCount: number;
};

const SunoPromptAccordionContext = createContext<SunoPromptAccordionContextValue | null>(
  null,
);

function SunoPromptAccordionProvider({
  fieldIds,
  children,
}: {
  fieldIds: string[];
  children: React.ReactNode;
}) {
  const fieldIdsSignature = [...new Set(fieldIds)].sort().join("\x1e");
  const sortedUnique = useMemo(
    () => [...new Set(fieldIds)].sort(),
    // `fieldIdsSignature` fingerprints `fieldIds` by value so the provider can memoize without
    // referential churn from inline arrays created in the parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fieldIdsSignature],
  );

  const [openById, setOpenById] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sortedUnique.map((id) => [id, true])),
  );

  const isFieldOpen = useCallback(
    (id: string) => openById[id] !== false,
    [openById],
  );

  const setFieldOpen = useCallback((id: string, open: boolean) => {
    setOpenById((prev) => ({ ...prev, [id]: open }));
  }, []);

  const expandAllFields = useCallback(() => {
    setOpenById(Object.fromEntries(sortedUnique.map((id) => [id, true])));
  }, [sortedUnique]);

  const collapseAllFields = useCallback(() => {
    setOpenById(Object.fromEntries(sortedUnique.map((id) => [id, false])));
  }, [sortedUnique]);

  const allFieldsExpanded =
    sortedUnique.length > 0 && sortedUnique.every((id) => openById[id] !== false);

  const allFieldsCollapsed =
    sortedUnique.length > 0 && sortedUnique.every((id) => openById[id] === false);

  const value = useMemo(
    () => ({
      isFieldOpen,
      setFieldOpen,
      expandAllFields,
      collapseAllFields,
      allFieldsExpanded,
      allFieldsCollapsed,
      fieldCount: sortedUnique.length,
    }),
    [
      allFieldsCollapsed,
      allFieldsExpanded,
      collapseAllFields,
      expandAllFields,
      isFieldOpen,
      setFieldOpen,
      sortedUnique,
    ],
  );

  return (
    <SunoPromptAccordionContext.Provider value={value}>{children}</SunoPromptAccordionContext.Provider>
  );
}

function SunoAccordionBulkControls() {
  const ctx = useContext(SunoPromptAccordionContext);
  if (!ctx || ctx.fieldCount === 0) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button
        disabled={ctx.allFieldsExpanded}
        onClick={ctx.expandAllFields}
        size="sm"
        type="button"
        variant="outline"
      >
        Tout déployer
      </Button>
      <Button
        disabled={ctx.allFieldsCollapsed}
        onClick={ctx.collapseAllFields}
        size="sm"
        type="button"
        variant="outline"
      >
        Tout replier
      </Button>
    </div>
  );
}

function hasSessionMetaBlock(data: SunoPromptV2): boolean {
  return buildSessionMetaLines(data).length > 0;
}

function buildSessionMetaLines(data: SunoPromptV2): string[] {
  const lines: string[] = [];
  if (data.status) {
    if (data.status.recipeName) lines.push(`Recipe: ${data.status.recipeName}`);
    if (data.status.goal) lines.push(`Goal: ${data.status.goal}`);
    if (data.status.model) lines.push(`Model: ${data.status.model}`);
    if (data.status.targetDuration) lines.push(`Target duration: ${data.status.targetDuration}`);
  }
  if (data.instructions) {
    if (data.instructions.voice) lines.push(`Voice: ${data.instructions.voice}`);
    if (data.instructions.structure) lines.push(`Structure: ${data.instructions.structure}`);
    if (data.instructions.workflowNotes) lines.push(`Workflow: ${data.instructions.workflowNotes}`);
    const operatorEdits = data.instructions.fullSongOperatorEdits;
    if (operatorEdits) {
      lines.push("", "Operator full song (manual):");
      lines.push(`  Style suffix: ${operatorEdits.styleOfMusicSuffix}`);
      for (const edit of operatorEdits.autoLyricsPrompt) {
        lines.push(`  - ${edit}`);
      }
    }
  }
  if (data.qualityChecks?.length) {
    lines.push("Quality checks:", ...data.qualityChecks.map((c) => `- ${c}`));
  }
  return lines;
}

export function SunoPromptPack({
  videoId,
  view,
}: {
  videoId: string;
  view: SunoAssemblyPromptView;
}) {
  const [lastCopied, setLastCopied] = useState<string | null>(null);

  async function copyLabel(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setLastCopied(label);
    window.setTimeout(() => setLastCopied(null), 2000);
  }

  const recipeAgentHref = `/videos/${videoId}#recipe-agent`;

  if (view.source === "fallback") {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTitle>No synced Suno prompt yet</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Run the Recipe Agent with stage{" "}
              <span className="font-medium">Revise Suno prompt</span> so{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">suno-prompt.md</code>{" "}
              (and ideally{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">suno-prompt.json</code>) sync into this
              project. The text below is only a placeholder — it is not a final Suno paste.
            </p>
            <Button asChild size="sm" variant="secondary">
              <Link href={recipeAgentHref}>Open Recipe Agent</Link>
            </Button>
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Fallback</Badge>
        </div>
        <SunoPromptAccordionProvider fieldIds={["fallback"]} key="suno-fallback">
          <div className="flex justify-end">
            <SunoAccordionBulkControls />
          </div>
          <SunoFieldCard
            copied={lastCopied === "fallback"}
            description="Song target remains about 2–3 minutes for streaming; trim an excerpt (often 45–90 seconds) for the vertical edit — not the other way around."
            fieldId="fallback"
            label="Fallback context"
            onCopy={() => copyLabel("fallback", view.prompt)}
            textareaClassName="min-h-40"
            value={view.prompt}
          />
        </SunoPromptAccordionProvider>
      </div>
    );
  }

  if (view.source === "v2") {
    const f = view.v2.fields;
    const fullPack = buildMarkdownPackFromV2(view.v2);
    const v2FieldIds = ["style", "exclude", "lyrics", "short"];
    if (hasSessionMetaBlock(view.v2)) {
      v2FieldIds.push("session");
    }
    return (
      <div className="space-y-4">
        <SunoHowToCollapsible />
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Structured v2</Badge>
          <Badge variant="outline">Agent JSON</Badge>
        </div>
        <SunoPromptAccordionProvider fieldIds={v2FieldIds} key={JSON.stringify(v2FieldIds)}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <QuickCopyRow
              copiedKey={lastCopied}
              onCopy={copyLabel}
              titleText={f.title}
              styleText={f.styleOfMusic}
              excludeText={f.excludeStyles}
              lyricsText={f.autoLyricsPrompt}
            />
            <SunoAccordionBulkControls />
          </div>
          <div className="space-y-4">
            <SunoTitleCard
              copied={lastCopied === "title"}
              description="Suno → Title (set first — names the project in Suno)"
              onCopy={() => copyLabel("title", f.title)}
              value={f.title}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <SunoFieldCard
                copied={lastCopied === "style"}
                description="Suno → Custom Mode → Style of Music"
                fieldId="style"
                label="Style of Music"
                onCopy={() => copyLabel("style", f.styleOfMusic)}
                textareaClassName="min-h-32"
                value={f.styleOfMusic}
              />
              <SunoFieldCard
                copied={lastCopied === "exclude"}
                description="Suno → Custom Mode → Exclude styles"
                fieldId="exclude"
                label="Exclude styles"
                onCopy={() => copyLabel("exclude", f.excludeStyles)}
                textareaClassName="min-h-32"
                value={f.excludeStyles}
              />
            </div>
            <SunoFieldCard
              copied={lastCopied === "lyrics"}
              description="Suno → Custom Mode → Lyrics prompt (auto)"
              fieldId="lyrics"
              label="Auto lyrics prompt"
              onCopy={() => copyLabel("lyrics", f.autoLyricsPrompt)}
              textareaClassName="min-h-48"
              value={f.autoLyricsPrompt}
            />
            <SunoFieldCard
              copied={lastCopied === "short"}
              description="Keep for your editor / short-form cut"
              fieldId="short"
              label="Short version plan"
              onCopy={() => copyLabel("short", f.shortVersionPlan)}
              textareaClassName="min-h-28"
              value={f.shortVersionPlan}
            />
          </div>
          <SessionMetaCard
            copied={lastCopied}
            data={view.v2}
            onCopySession={copyLabel}
          />
          <CopyFieldButton
            copied={lastCopied === "full"}
            label="Copy full Suno pack"
            onCopy={() => copyLabel("full", fullPack)}
          />
        </SunoPromptAccordionProvider>
      </div>
    );
  }

  const { parsed } = view;
  const s = parsed.sections;
  const fullPack = buildNormalizedMarkdownPack(s);

  if (!parsed.useSectionCards) {
    return (
      <div className="space-y-4">
        <SunoHowToCollapsible />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Legacy markdown</Badge>
          <Badge variant="outline">Unparsed body</Badge>
        </div>
        <Alert>
          <AlertTitle>Markdown format not recognized</AlertTitle>
          <AlertDescription>
            Sections were not detected reliably. Copy the raw prompt or ask the agent for a structured Suno
            revision. Prefer upgrading to{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">suno-prompt.json</code> (Recipe Agent) for
            stable fields.
          </AlertDescription>
        </Alert>
        <SunoPromptAccordionProvider fieldIds={["raw"]} key="suno-raw">
          <div className="flex justify-end">
            <SunoAccordionBulkControls />
          </div>
          <SunoFieldCard
            copied={lastCopied === "raw"}
            description="Full suno-prompt.md body from the agent workspace."
            fieldId="raw"
            label="Raw Suno markdown"
            onCopy={() => copyLabel("raw", view.parsed.rawMarkdown)}
            textareaClassName="min-h-48"
            value={view.parsed.rawMarkdown}
          />
        </SunoPromptAccordionProvider>
      </div>
    );
  }

  const markdownAccordionFieldIds = [...SUNO_MARKDOWN_ACCORDION_FIELD_IDS];

  return (
    <div className="space-y-4">
      <SunoHowToCollapsible />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Legacy markdown</Badge>
        <Badge variant="outline">Parsed sections</Badge>
      </div>
      <SunoPromptAccordionProvider
        fieldIds={markdownAccordionFieldIds}
        key={JSON.stringify(markdownAccordionFieldIds)}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <QuickCopyRow
            copiedKey={lastCopied}
            onCopy={copyLabel}
            titleText={s.title}
            styleText={s.styleOfMusic}
            excludeText={s.excludeStyles}
            lyricsText={s.autoLyricsPrompt}
          />
          <SunoAccordionBulkControls />
        </div>
        <div className="space-y-4">
          <SunoTitleCard
            copied={lastCopied === "title"}
            description="Suno → Title (set first — names the project in Suno)"
            onCopy={() => copyLabel("title", s.title)}
            value={s.title}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <SunoFieldCard
              copied={lastCopied === "style"}
              description="Suno → Custom Mode → Style of Music"
              fieldId="style"
              label="Style of Music"
              onCopy={() => copyLabel("style", s.styleOfMusic)}
              textareaClassName="min-h-32"
              value={s.styleOfMusic}
            />
            <SunoFieldCard
              copied={lastCopied === "exclude"}
              description="Suno → Custom Mode → Exclude styles"
              fieldId="exclude"
              label="Exclude styles"
              onCopy={() => copyLabel("exclude", s.excludeStyles)}
              textareaClassName="min-h-32"
              value={s.excludeStyles}
            />
          </div>
          <SunoFieldCard
            copied={lastCopied === "lyrics"}
            description="Suno → Custom Mode → Lyrics prompt (auto)"
            fieldId="lyrics"
            label="Auto lyrics prompt"
            onCopy={() => copyLabel("lyrics", s.autoLyricsPrompt)}
            textareaClassName="min-h-48"
            value={s.autoLyricsPrompt}
          />
          <SunoFieldCard
            copied={lastCopied === "short"}
            description="Keep for your editor / short-form cut"
            fieldId="short"
            label="Short version plan"
            onCopy={() => copyLabel("short", s.shortVersionPlan)}
            textareaClassName="min-h-28"
            value={s.shortVersionPlan}
          />
        </div>
        <CopyFieldButton
          copied={lastCopied === "full"}
          label="Copy full Suno pack"
          onCopy={() => copyLabel("full", fullPack)}
        />
      </SunoPromptAccordionProvider>
    </div>
  );
}

function SunoTitleCard({
  value,
  copied,
  onCopy,
  description,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <CardTitle className="text-base">Title</CardTitle>
            <CardDescription className="text-xs leading-snug">{description}</CardDescription>
          </div>
          <Button
            className="shrink-0"
            disabled={!value.trim()}
            onClick={onCopy}
            size="sm"
            type="button"
            variant="outline"
          >
            {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Textarea
          aria-label="Title for Suno"
          className="min-h-[4.25rem] resize-y font-mono text-sm leading-relaxed md:min-h-[5rem]"
          readOnly
          value={value}
        />
      </CardContent>
    </Card>
  );
}

function SunoHowToCollapsible() {
  return (
    <Collapsible defaultOpen={false}>
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <p className="text-sm font-medium leading-snug">
          How to use with Suno (Custom Mode)
        </p>
        <CollapsibleTrigger asChild>
          <Button
            aria-label="Show or hide Suno instructions"
            className="shrink-0 [&[data-state=open]>svg]:rotate-180"
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronDown className="h-4 w-4 transition-transform duration-200" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="mt-2 rounded-lg border bg-background px-3 py-3 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Generate a <span className="font-medium text-foreground">full song</span> of about{" "}
              <span className="font-medium text-foreground">2–3 minutes</span> for streaming; the short video uses a
              trimmed excerpt, not a 30-second “whole song”.
            </li>
            <li>
              In Suno, set the <span className="font-medium text-foreground">Title</span> first, then paste{" "}
              <span className="font-medium text-foreground">Style</span>,{" "}
              <span className="font-medium text-foreground">Excludes</span>, and the{" "}
              <span className="font-medium text-foreground">auto lyrics</span> prompt into the matching Custom Mode
              fields.
            </li>
            <li>Use the short-version plan when editing the vertical cut.</li>
          </ol>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function QuickCopyRow({
  titleText,
  styleText,
  excludeText,
  lyricsText,
  onCopy,
  copiedKey,
}: {
  titleText: string;
  styleText: string;
  excludeText: string;
  lyricsText: string;
  onCopy: (key: string, text: string) => void;
  copiedKey: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        disabled={!titleText.trim()}
        onClick={() => onCopy("quick-title", titleText)}
        size="sm"
        type="button"
        variant="secondary"
      >
        {copiedKey === "quick-title" ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        Copy title
      </Button>
      <Button
        disabled={!styleText.trim()}
        onClick={() => onCopy("quick-style", styleText)}
        size="sm"
        type="button"
        variant="secondary"
      >
        {copiedKey === "quick-style" ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        Copy style field
      </Button>
      <Button
        disabled={!excludeText.trim()}
        onClick={() => onCopy("quick-exclude", excludeText)}
        size="sm"
        type="button"
        variant="secondary"
      >
        {copiedKey === "quick-exclude" ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        Copy exclude field
      </Button>
      <Button
        disabled={!lyricsText.trim()}
        onClick={() => onCopy("quick-lyrics", lyricsText)}
        size="sm"
        type="button"
        variant="secondary"
      >
        {copiedKey === "quick-lyrics" ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        Copy auto lyrics field
      </Button>
    </div>
  );
}

function SessionMetaCard({
  data,
  onCopySession,
  copied,
}: {
  data: SunoPromptV2;
  onCopySession: (key: string, text: string) => void;
  copied: string | null;
}) {
  const lines = buildSessionMetaLines(data);
  if (lines.length === 0) {
    return null;
  }
  const text = lines.join("\n");
  return (
    <SunoFieldCard
      copied={copied === "session"}
      description="Session notes (optional reference — not always pasted into Suno)"
      fieldId="session"
      label="Full session notes"
      onCopy={() => onCopySession("session", text)}
      textareaClassName="min-h-32"
      value={text}
    />
  );
}

function SunoFieldCard({
  fieldId,
  label,
  description,
  value,
  onCopy,
  copied,
  textareaClassName,
}: {
  fieldId: string;
  label: string;
  description: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  textareaClassName?: string;
}) {
  const ctx = useContext(SunoPromptAccordionContext);
  const collapsibleProps: ComponentProps<typeof Collapsible> = ctx
    ? {
        open: ctx.isFieldOpen(fieldId),
        onOpenChange: (open: boolean) => {
          ctx.setFieldOpen(fieldId, open);
        },
      }
    : { defaultOpen: true };

  return (
    <Card>
      <Collapsible {...collapsibleProps}>
        <CardHeader className="space-y-1 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">{label}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button disabled={!value.trim()} onClick={onCopy} size="sm" type="button" variant="outline">
                {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <CollapsibleTrigger asChild>
                <Button
                  aria-label="Show or hide field preview"
                  className="shrink-0 [&[data-state=open]>svg]:rotate-180"
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <Textarea
              aria-label={label}
              className={`font-mono text-xs ${textareaClassName ?? "min-h-28"}`}
              readOnly
              value={value}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function CopyFieldButton({
  label,
  onCopy,
  copied,
}: {
  label: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <Button onClick={onCopy} type="button" variant="default">
      {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
