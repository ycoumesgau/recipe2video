import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, ShieldCheck } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import {
  getCurrentProfile,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_SFX_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
} from "@/modules/videos/video.constants";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getCurrentProfile().catch(async (error) => {
    if (isAuthAccessError(error) && error.code === "unauthorized") {
      redirect("/auth/sign-out?status=unauthorized");
    }

    throw error;
  });

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <section>
        <Badge className="mb-3" variant="outline">
          Internal Licorn settings
        </Badge>
        <h2 className="licorn-page-title">Settings</h2>
        <p className="max-w-3xl text-muted-foreground">
          Recipe2Video is an internal Licorn cockpit. Sensitive configuration
          stays in environment variables on the server. This page exposes the
          read-only context that affects costly operations.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Authenticated user
            </CardTitle>
            <CardDescription>
              Costly Runway, OpenAI, Mux, and Remotion actions verify this
              profile against the `allowed_users` table on every request.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Fact label="Email" value={profile.email} />
            <Fact label="Role" value={profile.role} />
            <Fact label="Profile ID" value={profile.id} />
            <Separator />
            <p className="text-muted-foreground">
              To grant access to a new internal user, insert a row into
              `allowed_users` through Supabase. No public signup is exposed.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default generation models</CardTitle>
            <CardDescription>
              Project-level model selectors override these defaults. Recipe2Video
              never silently falls back to a different model.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Fact label="Video" value={DEFAULT_VIDEO_MODEL} />
            <Fact label="Image" value={DEFAULT_IMAGE_MODEL} />
            <Fact label="TTS" value={DEFAULT_TTS_MODEL} />
            <Fact label="SFX" value={DEFAULT_SFX_MODEL} />
            <Separator />
            <p className="text-muted-foreground">
              Seedance 2 availability is verified at project creation. If the
              model is unavailable, the user is asked to switch manually.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server-side configuration</CardTitle>
          <CardDescription>
            These services are configured via environment variables on the
            server. See `.env.example` and `docs/technical-contracts.md` for the
            full list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="grid gap-2 md:grid-cols-2">
            <ConfigRow label="Supabase Auth" detail="Magic Link, allowlist enforced" />
            <ConfigRow label="Supabase Postgres" detail="Project state, costs, feedback" />
            <ConfigRow label="Supabase Storage" detail="Durable original media masters" />
            <ConfigRow label="Runway API" detail="Seedance 2, GPT-Image 2, ElevenLabs" />
            <ConfigRow label="OpenAI API" detail="GPT-5.5 High planning + diffs" />
            <ConfigRow label="Mux Pay-as-you-go" detail="Playback and review only" />
            <ConfigRow label="Inngest" detail="Durable workflows + polling" />
          </ul>
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>Where to change behavior</AlertTitle>
        <AlertDescription>
          <span>
            Use the project-level dropdowns in `/videos/new` and the segment
            review screens to change models per project or per regeneration.
            Update server secrets through the Vercel and Supabase project
            consoles.
          </span>
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/docs">
            Read in-app docs
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}

function ConfigRow({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="rounded-lg border bg-background/60 p-3">
      <p className="font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </li>
  );
}
