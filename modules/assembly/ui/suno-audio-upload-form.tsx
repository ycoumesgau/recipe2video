"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  completeSunoAudioUploadAction,
  prepareSunoAudioUploadAction,
} from "../actions";

export function SunoAudioUploadForm({ videoId }: { videoId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setErrorMessage("Choose a Suno audio file before uploading.");
      return;
    }

    startUpload(async () => {
      try {
        const prepared = await prepareSunoAudioUploadAction({
          videoId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });

        if (prepared.status !== "ready" || !prepared.signedUrl || !prepared.storagePath) {
          setErrorMessage(prepared.message ?? "Unable to prepare Suno audio upload.");
          return;
        }

        const uploadResponse = await fetch(prepared.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          setErrorMessage(
            `Storage upload failed (${uploadResponse.status}). Try again or use a smaller file.`,
          );
          return;
        }

        const completed = await completeSunoAudioUploadAction({
          videoId,
          storagePath: prepared.storagePath,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });

        if (completed.status === "error") {
          setErrorMessage(completed.message);
          return;
        }

        router.push(
          `/videos/${videoId}/music?notice=success&message=${encodeURIComponent(
            completed.message,
          )}`,
        );
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Suno audio upload failed.",
        );
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="file">Suno audio file</Label>
        <Input
          accept="audio/mpeg,audio/mp3,audio/wav,audio/aac,audio/flac"
          disabled={isUploading}
          id="file"
          name="file"
          ref={fileInputRef}
          required
          type="file"
        />
        <p className="text-xs text-muted-foreground">
          MP3, WAV, AAC, or FLAC. Maximum 50 MB. Upload goes directly to Supabase
          Storage (required on Vercel production).
        </p>
      </div>
      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <Button disabled={isUploading} type="submit">
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {isUploading ? "Uploading…" : "Upload and link audio"}
      </Button>
    </form>
  );
}
