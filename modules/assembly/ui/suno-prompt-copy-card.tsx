"use client";

import { useState } from "react";
import { Copy, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function SunoPromptCopyCard({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generated Suno prompt</CardTitle>
        <CardDescription>
          Copy this prompt into Suno manually, then upload the generated audio
          below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          aria-label="Generated Suno prompt"
          className="min-h-72 font-mono text-xs"
          readOnly
          value={prompt}
        />
        <Button onClick={copyPrompt} type="button">
          {copied ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "Prompt copied" : "Copy prompt"}
        </Button>
      </CardContent>
    </Card>
  );
}
