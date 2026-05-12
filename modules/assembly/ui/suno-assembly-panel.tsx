"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileAudio,
  Upload,
} from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import type { LogicalScene, SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import type { VideoProject } from "@/modules/videos/video.types";

import type { Composition } from "../assembly.types";
import { uploadSunoAudioAction } from "../actions";
import { resolveSunoAssemblyPromptView } from "../suno-assembly-prompt";
import { SunoPromptPack } from "./suno-prompt-pack";

export function SunoAssemblyPanel({
  composition,
  logicalScenes,
  notice,
  project,
  seedanceSegments,
  sunoAudioAssets,
  videoId,
}: {
  composition: Composition | null;
  logicalScenes: LogicalScene[];
  notice?: { type: "success" | "error"; message: string } | null;
  project: VideoProject | null;
  seedanceSegments: SeedanceSegment[];
  sunoAudioAssets: MediaAsset[];
  videoId: string;
}) {
  const sunoView = resolveSunoAssemblyPromptView({
    project,
    logicalScenes,
    seedanceSegments,
  });
  const linkedAudio = getLinkedAudioAsset(composition, sunoAudioAssets);

  return (
    <div className="space-y-6">
      {notice ? (
        <Alert variant={notice.type === "error" ? "destructive" : "default"}>
          {notice.type === "error" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertTitle>
            {notice.type === "error" ? "Suno workflow failed" : "Suno workflow updated"}
          </AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,400px)]">
        <SunoPromptPack videoId={videoId} view={sunoView} />
        <div className="space-y-4">
          <SunoAudioUploadCard videoId={videoId} />
          <LinkedAudioCard linkedAudio={linkedAudio} />
          <UploadedAudioList assets={sunoAudioAssets} />
        </div>
      </div>
    </div>
  );
}

function SunoAudioUploadCard({ videoId }: { videoId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Suno audio</CardTitle>
        <CardDescription>
          Stores the original audio in Supabase Storage and links it to the
          project composition.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={uploadSunoAudioAction} className="space-y-4">
          <input name="videoId" type="hidden" value={videoId} />
          <div className="space-y-2">
            <Label htmlFor="file">Suno audio file</Label>
            <Input
              accept="audio/mpeg,audio/mp3,audio/wav,audio/aac,audio/flac"
              id="file"
              name="file"
              required
              type="file"
            />
            <p className="text-xs text-muted-foreground">
              MP3, WAV, AAC, or FLAC. Maximum 50 MB.
            </p>
          </div>
          <Button type="submit">
            <Upload className="h-4 w-4" />
            Upload and link audio
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function LinkedAudioCard({ linkedAudio }: { linkedAudio: MediaAsset | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assembly audio</CardTitle>
        <CardDescription>
          Remotion will use the Supabase Storage original when assembly preview
          and export are implemented.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linkedAudio ? (
          <AudioAssetSummary asset={linkedAudio} linked />
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No music uploaded yet. Assembly remains valid without music.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UploadedAudioList({ assets }: { assets: MediaAsset[] }) {
  return (
    <Card>
      <Collapsible defaultOpen={false}>
        <CardHeader className="space-y-0 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Uploaded Suno files</CardTitle>
              <CardDescription>
                Stored originals remain in the `suno-audio` bucket.
              </CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button
                aria-label="Show or hide uploaded files list"
                className="shrink-0 [&[data-state=open]>svg]:rotate-180"
                size="icon"
                type="button"
                variant="ghost"
              >
                <ChevronDown className="h-4 w-4 transition-transform duration-200" />
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {assets.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Upload a sample MP3 to verify it appears here.
              </div>
            ) : (
              assets.map((asset) => <AudioAssetSummary asset={asset} key={asset.id} />)
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function AudioAssetSummary({
  asset,
  linked,
}: {
  asset: MediaAsset;
  linked?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <FileAudio className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {asset.originalFilename ?? "suno-audio"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {asset.storageBucket}/{asset.storagePath}
            </p>
          </div>
        </div>
        <Badge variant={linked ? "default" : "outline"}>{asset.status}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="MIME" value={asset.mimeType ?? "unknown"} />
        <Metric label="Size" value={formatBytes(asset.fileSizeBytes)} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function getLinkedAudioAsset(
  composition: Composition | null,
  assets: MediaAsset[],
) {
  if (composition?.audioMediaAssetId) {
    return (
      assets.find((asset) => asset.id === composition.audioMediaAssetId) ?? null
    );
  }

  return assets[0] ?? null;
}

function formatBytes(bytes?: number | null) {
  if (!bytes) {
    return "unknown";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
