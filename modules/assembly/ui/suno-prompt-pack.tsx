"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";

import type { SunoAssemblyPromptView } from "../suno-assembly-prompt";
import type { SunoPromptV2 } from "@/modules/recipe-agent/suno-prompt-v2.schema";
import { buildMarkdownPackFromV2 } from "@/modules/recipe-agent/suno-prompt-v2.schema";
import { buildNormalizedMarkdownPack } from "../suno-prompt-format";

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
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Fallback context</CardTitle>
              <Badge variant="outline">Fallback</Badge>
            </div>
            <CardDescription>
              Song target remains <span className="font-medium">about 2–3 minutes</span> for streaming; trim an
              excerpt (often 45–90 seconds) for the vertical edit — not the other way around.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              aria-label="Fallback Suno context"
              className="min-h-56 font-mono text-xs"
              readOnly
              value={view.prompt}
            />
            <CopyFieldButton
              copied={lastCopied === "fallback"}
              label="Copy fallback notes"
              onCopy={() => copyLabel("fallback", view.prompt)}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view.source === "v2") {
    const f = view.v2.fields;
    const fullPack = buildMarkdownPackFromV2(view.v2);
    return (
      <div className="space-y-4">
        <SunoHowToAlert />
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Structured v2</Badge>
          <Badge variant="outline">Agent JSON</Badge>
        </div>
        <QuickCopyRow
          copiedKey={lastCopied}
          onCopy={copyLabel}
          titleText={f.title}
          styleText={f.styleOfMusic}
          excludeText={f.excludeStyles}
          lyricsText={f.autoLyricsPrompt}
        />
        <SunoFieldCard
          copied={lastCopied === "title"}
          description="Suno → Title (set first — names the project in Suno)"
          label="Title"
          onCopy={() => copyLabel("title", f.title)}
          value={f.title}
        />
        <SunoFieldCard
          copied={lastCopied === "style"}
          description="Suno → Custom Mode → Style of Music"
          label="Style of Music"
          onCopy={() => copyLabel("style", f.styleOfMusic)}
          value={f.styleOfMusic}
        />
        <SunoFieldCard
          copied={lastCopied === "exclude"}
          description="Suno → Custom Mode → Exclude styles"
          label="Exclude styles"
          onCopy={() => copyLabel("exclude", f.excludeStyles)}
          value={f.excludeStyles}
        />
        <SunoFieldCard
          copied={lastCopied === "lyrics"}
          className="min-h-80"
          description="Suno → Custom Mode → Lyrics prompt (auto)"
          label="Auto lyrics prompt"
          onCopy={() => copyLabel("lyrics", f.autoLyricsPrompt)}
          value={f.autoLyricsPrompt}
        />
        <SunoFieldCard
          copied={lastCopied === "short"}
          description="Keep for your editor / short-form cut"
          label="Short version plan"
          onCopy={() => copyLabel("short", f.shortVersionPlan)}
          value={f.shortVersionPlan}
        />
        <SessionMetaCard
          copied={lastCopied}
          onCopySession={copyLabel}
          data={view.v2}
        />
        <CopyFieldButton
          copied={lastCopied === "full"}
          label="Copy full Suno pack"
          onCopy={() => copyLabel("full", fullPack)}
        />
      </div>
    );
  }

  const { parsed } = view;
  const s = parsed.sections;
  const fullPack = buildNormalizedMarkdownPack(s);

  if (!parsed.useSectionCards) {
    return (
      <div className="space-y-4">
        <SunoHowToAlert />
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
        <Card>
          <CardHeader>
            <CardTitle>Raw Suno markdown</CardTitle>
            <CardDescription>
              Full <code className="text-xs">suno-prompt.md</code> body from the agent workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              aria-label="Raw Suno markdown"
              className="min-h-96 font-mono text-xs"
              readOnly
              value={view.parsed.rawMarkdown}
            />
            <CopyFieldButton
              copied={lastCopied === "raw"}
              label="Copy raw markdown"
              onCopy={() => copyLabel("raw", view.parsed.rawMarkdown)}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SunoHowToAlert />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Legacy markdown</Badge>
        <Badge variant="outline">Parsed sections</Badge>
      </div>
      <QuickCopyRow
        copiedKey={lastCopied}
        onCopy={copyLabel}
        titleText={s.title}
        styleText={s.styleOfMusic}
        excludeText={s.excludeStyles}
        lyricsText={s.autoLyricsPrompt}
      />
      {s.preamble.trim() ? (
        <SunoFieldCard
          copied={lastCopied === "preamble"}
          description="Intro / notes from the agent (optional in Suno)"
          label="Preamble"
          onCopy={() => copyLabel("preamble", s.preamble)}
          value={s.preamble}
        />
      ) : null}
      <SunoFieldCard
        copied={lastCopied === "title"}
        description="Suno → Title (set first — names the project in Suno)"
        label="Title"
        onCopy={() => copyLabel("title", s.title)}
        value={s.title}
      />
      <SunoFieldCard
        copied={lastCopied === "style"}
        description="Suno → Custom Mode → Style of Music"
        label="Style of Music"
        onCopy={() => copyLabel("style", s.styleOfMusic)}
        value={s.styleOfMusic}
      />
      <SunoFieldCard
        copied={lastCopied === "exclude"}
        description="Suno → Custom Mode → Exclude styles"
        label="Exclude styles"
        onCopy={() => copyLabel("exclude", s.excludeStyles)}
        value={s.excludeStyles}
      />
      <SunoFieldCard
        copied={lastCopied === "lyrics"}
        className="min-h-80"
        description="Suno → Custom Mode → Lyrics prompt (auto)"
        label="Auto lyrics prompt"
        onCopy={() => copyLabel("lyrics", s.autoLyricsPrompt)}
        value={s.autoLyricsPrompt}
      />
      <SunoFieldCard
        copied={lastCopied === "short"}
        description="Keep for your editor / short-form cut"
        label="Short version plan"
        onCopy={() => copyLabel("short", s.shortVersionPlan)}
        value={s.shortVersionPlan}
      />
      <CopyFieldButton
        copied={lastCopied === "full"}
        label="Copy full Suno pack"
        onCopy={() => copyLabel("full", fullPack)}
      />
    </div>
  );
}

function SunoHowToAlert() {
  return (
    <Alert>
      <AlertTitle>How to use with Suno (Custom Mode)</AlertTitle>
      <AlertDescription>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm">
          <li>
            Generate a <span className="font-medium">full song</span> of about{" "}
            <span className="font-medium">2–3 minutes</span> for streaming; the short video uses a trimmed excerpt,
            not a 30-second “whole song”.
          </li>
          <li>
            In Suno, set the <span className="font-medium">Title</span> first, then paste{" "}
            <span className="font-medium">Style</span>, <span className="font-medium">Excludes</span>, and the{" "}
            <span className="font-medium">auto lyrics</span> prompt into the matching Custom Mode fields.
          </li>
          <li>Use the short-version plan when editing the vertical cut.</li>
        </ol>
      </AlertDescription>
    </Alert>
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
  }
  if (data.qualityChecks?.length) {
    lines.push("Quality checks:", ...data.qualityChecks.map((c) => `- ${c}`));
  }
  if (lines.length === 0) {
    return null;
  }
  const text = lines.join("\n");
  return (
    <SunoFieldCard
      copied={copied === "session"}
      description="Session notes (optional reference — not always pasted into Suno)"
      label="Full session notes"
      onCopy={() => onCopySession("session", text)}
      value={text}
    />
  );
}

function SunoFieldCard({
  label,
  description,
  value,
  onCopy,
  copied,
  className,
}: {
  label: string;
  description: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  className?: string;
}) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{label}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button disabled={!value.trim()} onClick={onCopy} size="sm" type="button" variant="outline">
            {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          aria-label={label}
          className={`min-h-32 font-mono text-xs ${className ?? ""}`}
          readOnly
          value={value}
        />
      </CardContent>
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
