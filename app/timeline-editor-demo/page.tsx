import type { Metadata } from "next";

import { TimelineEditorDemo } from "./timeline-editor-demo";

export const metadata: Metadata = {
  title: "Timeline editor demo",
  description:
    "Standalone preview of the assembly timeline editor with mock segments and audio.",
};

export default function TimelineEditorDemoPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Timeline editor demo
        </h1>
        <p className="text-sm text-muted-foreground">
          Self-contained preview of{" "}
          <code className="rounded bg-muted px-1">TimelineEditor</code> with
          three mock segments and one mock audio track. Useful for validating
          the editor without authenticating against Supabase.
        </p>
      </header>
      <TimelineEditorDemo />
    </div>
  );
}
