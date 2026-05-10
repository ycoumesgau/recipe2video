"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import {
  uploadMediaAssetToMuxAction,
  type MuxUploadActionState,
} from "@/modules/media-assets/actions";

import { RecipeMuxPlayer } from "./mux-player";

const initialState: MuxUploadActionState = {};

export function MuxUploadTestPanel({
  candidates,
  playableAssets,
}: {
  candidates: MediaAsset[];
  playableAssets: MediaAsset[];
}) {
  const [state, formAction] = useActionState(
    uploadMediaAssetToMuxAction,
    initialState,
  );

  return (
    <div className="space-y-6">
      {state.message ? (
        <Alert variant={state.status === "error" ? "destructive" : "default"}>
          {state.status === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertTitle>
            {state.status === "error" ? "Mux upload failed" : "Mux upload ready"}
          </AlertTitle>
          <AlertDescription>
            {state.message}
            {state.muxPlaybackId ? (
              <span className="mt-2 block font-mono text-xs">
                playback_id: {state.muxPlaybackId}
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Upload a Supabase MP4 to Mux</CardTitle>
          <CardDescription>
            This is a protected test action for issue #5. It keeps the Supabase
            original intact and stores the Mux IDs on the media asset row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {candidates.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="mediaAssetSelect">Stored video candidate</Label>
                <Select defaultValue={candidates[0]!.id} name="mediaAssetId">
                  <SelectTrigger id="mediaAssetSelect">
                    <SelectValue placeholder="Pick a candidate" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {candidates.map((asset) => (
                      <SelectItem key={asset.id} value={asset.id}>
                        {formatAssetLabel(asset)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="mediaAssetId">Media asset ID</Label>
                <Input
                  id="mediaAssetId"
                  name="mediaAssetId"
                  placeholder="Paste a media_assets.id for a stored MP4"
                />
                <p className="text-xs text-muted-foreground">
                  No stored MP4 candidates were found automatically.
                </p>
              </div>
            )}

            <SubmitButton />
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        {playableAssets.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Mux playback yet</CardTitle>
              <CardDescription>
                Uploaded assets with a stored playback ID will appear here.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          playableAssets.map((asset) => (
            <Card key={asset.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{asset.status}</Badge>
                  <Badge variant="outline">{asset.type}</Badge>
                </div>
                <CardTitle className="break-words text-lg">
                  {asset.originalFilename ?? asset.id}
                </CardTitle>
                <CardDescription className="break-all">
                  Mux playback ID: {asset.muxPlaybackId}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RecipeMuxPlayer
                  playbackId={asset.muxPlaybackId}
                  title={asset.originalFilename ?? asset.id}
                />
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <UploadCloud className="h-4 w-4" />
      )}
      Upload to Mux Basic
    </Button>
  );
}

function formatAssetLabel(asset: MediaAsset) {
  const filename = asset.originalFilename ?? asset.storagePath ?? asset.id;
  return `${filename} (${asset.id})`;
}
