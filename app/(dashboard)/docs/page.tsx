import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const docs = [
  { href: "/README.md", label: "README.md" },
  { href: "/PRD.md", label: "PRD.md" },
  { href: "/docs/agent-workflow.md", label: "Agent workflow" },
  { href: "/docs/ux-contract.md", label: "UX contract" },
  { href: "/docs/technical-contracts.md", label: "Technical contracts" },
  { href: "/docs/github-issues-backlog.md", label: "GitHub issues backlog" },
  { href: "/docs/demo-runbook.md", label: "Demo runbook" },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="licorn-page-title">Docs</h2>
        <p className="text-muted-foreground">
          Contract documents that every agent should read before changing the
          product.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Repository documentation</CardTitle>
          <CardDescription>
            These links are placeholders until markdown rendering is added.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {docs.map((doc) => (
            <Link
              className="rounded-md border p-3 text-sm transition-colors hover:bg-accent"
              href={doc.href}
              key={doc.href}
            >
              {doc.label}
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
