"use client";

import { AlertTriangle, Download, Sparkles, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArtifactImageCard } from "@/modules/shared/ui/artifact-image-card";
import {
  SPOTIFY_CANVAS_MAX_DURATION_SECONDS,
  SPOTIFY_CANVAS_MIN_DURATION_SECONDS,
} from "@/modules/recipe-agent/song-cover-plan.schema";

import {
  generateSongCoverAction,
  selectSongCoverVariantAction,
  updateSongCanvasLoopSettingsAction,
  updateSongCoverImageReferencesAction,
  updateSongCoverPromptAction,
  updateSongCoverVideoReferencesAction,
  uploadSongCoverManualOverrideAction,
} from "../actions";
import type { SongCoverArtifactReview } from "../song-cover.types";

const DURATION_OPTIONS = Array.from(
  {
    length:
      SPOTIFY_CANVAS_MAX_DURATION_SECONDS -
      SPOTIFY_CANVAS_MIN_DURATION_SECONDS +
      1,
  },
  (_, i) => SPOTIFY_CANVAS_MIN_DURATION_SECONDS + i,
);

export function SpotifyCanvasCard({
  review,
  videoId,
}: {
  review: SongCoverArtifactReview;
  videoId: string;
}) {
  const { artifact } = review;
  const isGenerating = artifact.status === "generating";
  const activeMedia = review.mediaAsset;

  return (
    <ArtifactImageCard
      aspectRatioClassName="aspect-[9/16] h-80"
      badges={<Badge variant="outline">Spotify Canvas</Badge>}
      isGenerating={isGenerating}
      previewAlt="Spotify Canvas preview"
      previewUrl={null}
      runwayProgress={artifact.runwayProgress}
      runwayTaskStatus={artifact.runwayTaskStatus}
      status={artifact.status}
      subtitle={`Vertical 9:16 loop, ${artifact.durationSeconds ?? "?"}s, ${artifact.loopAnchorReferenceName ? `loops on @${artifact.loopAnchorReferenceName}` : "no loop anchor set"}.`}
      title="Spotify Canvas"
    >
      {/* Video preview replaces the still preview when a media asset exists. */}
      {review.previewUrl ? (
        <div className="mx-0 overflow-hidden rounded-lg border">
          <video
            autoPlay
            className="aspect-[9/16] w-full bg-black object-cover"
            loop
            muted
            playsInline
            src={review.previewUrl}
          >
            <track default kind="captions" srcLang="en" />
          </video>
        </div>
      ) : null}

      {review.unresolvedImageReferences.length +
        review.unresolvedVideoReferences.length >
      0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unresolved references</AlertTitle>
          <AlertDescription>
            {[
              ...review.unresolvedImageReferences,
              ...review.unresolvedVideoReferences,
            ].join(", ")}{" "}
            do not match anything in the asset library nor in this video&apos;s
            reference plan. Generation will fail until you fix the names.
          </AlertDescription>
        </Alert>
      ) : null}

      <details className="rounded-lg border bg-background/60 p-3 text-xs" open>
        <summary className="cursor-pointer font-medium">Prompt</summary>
        <p className="mt-2 text-muted-foreground">
          Must explicitly state that the first and last frame match @
          {artifact.loopAnchorReferenceName ?? "<loopAnchor>"} for a seamless
          loop. The handler appends the standard Spotify policy negatives if
          they are not already in the prompt.
        </p>
        <form
          action={updateSongCoverPromptAction}
          className="mt-3 space-y-2"
        >
          <input name="videoId" type="hidden" value={videoId} />
          <input name="artifactId" type="hidden" value={artifact.id} />
          <Textarea
            defaultValue={artifact.prompt}
            name="prompt"
            placeholder="Canvas prompt with explicit loop instruction and discrete mascot beat."
            rows={8}
          />
          <Button size="sm" type="submit" variant="outline">
            Save prompt
          </Button>
        </form>
      </details>

      <details className="rounded-lg border bg-background/60 p-3 text-xs">
        <summary className="cursor-pointer font-medium">
          Image references ({artifact.imageReferenceCanonicalNames.length} / 9)
        </summary>
        <form
          action={updateSongCoverImageReferencesAction}
          className="mt-3 space-y-2"
        >
          <input name="videoId" type="hidden" value={videoId} />
          <input name="artifactId" type="hidden" value={artifact.id} />
          <Label
            className="text-[11px] uppercase text-muted-foreground"
            htmlFor={`canvas-images-${artifact.id}`}
          >
            Canonical names
          </Label>
          <Textarea
            defaultValue={artifact.imageReferenceCanonicalNames.join(", ")}
            id={`canvas-images-${artifact.id}`}
            name="imageReferenceCanonicalNames"
            placeholder="KitchenIslandDefault, CharacterSheet, FinalDishVisual"
            rows={2}
          />
          <Button size="sm" type="submit" variant="outline">
            Save image references
          </Button>
        </form>
      </details>

      <details className="rounded-lg border bg-background/60 p-3 text-xs">
        <summary className="cursor-pointer font-medium">
          Video references ({artifact.videoReferenceCanonicalNames.length} / 3)
        </summary>
        <p className="mt-2 text-muted-foreground">
          Optional. Seedance combined cap is 15s across all video references.
          LicornOutroVideo only makes sense for a true celebration Canvas.
        </p>
        <form
          action={updateSongCoverVideoReferencesAction}
          className="mt-3 space-y-2"
        >
          <input name="videoId" type="hidden" value={videoId} />
          <input name="artifactId" type="hidden" value={artifact.id} />
          <Textarea
            defaultValue={artifact.videoReferenceCanonicalNames.join(", ")}
            name="videoReferenceCanonicalNames"
            placeholder="LicornOutroVideo"
            rows={2}
          />
          <Button size="sm" type="submit" variant="outline">
            Save video references
          </Button>
        </form>
      </details>

      <details className="rounded-lg border bg-background/60 p-3 text-xs" open>
        <summary className="cursor-pointer font-medium">Loop settings</summary>
        <form
          action={updateSongCanvasLoopSettingsAction}
          className="mt-3 space-y-2"
        >
          <input name="videoId" type="hidden" value={videoId} />
          <input name="artifactId" type="hidden" value={artifact.id} />
          <Label
            className="text-[11px] uppercase text-muted-foreground"
            htmlFor={`canvas-anchor-${artifact.id}`}
          >
            Loop anchor
          </Label>
          <select
            className="w-full rounded-md border bg-background px-2 py-1"
            defaultValue={artifact.loopAnchorReferenceName ?? ""}
            id={`canvas-anchor-${artifact.id}`}
            name="loopAnchorReferenceName"
          >
            <option value="" disabled>
              Pick one of the image references…
            </option>
            {artifact.imageReferenceCanonicalNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Label
            className="text-[11px] uppercase text-muted-foreground"
            htmlFor={`canvas-duration-${artifact.id}`}
          >
            Duration (seconds)
          </Label>
          <select
            className="w-full rounded-md border bg-background px-2 py-1"
            defaultValue={String(artifact.durationSeconds ?? "")}
            id={`canvas-duration-${artifact.id}`}
            name="durationSeconds"
          >
            <option value="" disabled>
              5..8 s
            </option>
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
          <Button size="sm" type="submit" variant="outline">
            Save loop settings
          </Button>
        </form>
      </details>

      {review.variants.length > 1 ? (
        <details className="rounded-lg border bg-background/60 p-3 text-xs">
          <summary className="cursor-pointer font-medium">
            Variants history ({review.variants.length})
          </summary>
          <div className="mt-3 space-y-2">
            {review.variants.map((variant, index) => (
              <div
                className="flex items-center gap-2 rounded-md border p-2"
                key={variant.mediaAsset.id}
              >
                <div className="flex h-16 w-9 shrink-0 items-center justify-center rounded bg-muted/40 text-[10px] text-muted-foreground">
                  9:16
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Variant {index + 1}</span>
                    {variant.isActive ? <Badge>Active</Badge> : null}
                  </div>
                  <form action={selectSongCoverVariantAction}>
                    <input name="videoId" type="hidden" value={videoId} />
                    <input name="artifactId" type="hidden" value={artifact.id} />
                    <input
                      name="mediaAssetId"
                      type="hidden"
                      value={variant.mediaAsset.id}
                    />
                    <Button
                      disabled={variant.isActive}
                      size="sm"
                      type="submit"
                      variant="outline"
                    >
                      Use this variant
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <form action={generateSongCoverAction}>
          <input name="videoId" type="hidden" value={videoId} />
          <input name="artifactId" type="hidden" value={artifact.id} />
          <input name="kind" type="hidden" value="spotify_canvas" />
          <Button disabled={isGenerating} size="sm" type="submit">
            <Sparkles className="h-4 w-4" />
            {isGenerating
              ? "Generating…"
              : activeMedia
                ? "Regenerate"
                : "Generate"}
          </Button>
        </form>

        <form
          action={uploadSongCoverManualOverrideAction}
          encType="multipart/form-data"
        >
          <input name="videoId" type="hidden" value={videoId} />
          <input name="artifactId" type="hidden" value={artifact.id} />
          <label className="inline-flex items-center gap-2">
            <input accept="video/*" name="file" type="file" />
            <Button size="sm" type="submit" variant="outline">
              <Upload className="h-4 w-4" />
              Upload override
            </Button>
          </label>
        </form>

        {activeMedia ? (
          <Button asChild size="sm" variant="outline">
            <a
              href={`/api/song-cover/${videoId}/spotify-canvas/download`}
              rel="noopener"
              target="_blank"
            >
              <Download className="h-4 w-4" />
              Download MP4
            </a>
          </Button>
        ) : null}
      </div>
    </ArtifactImageCard>
  );
}
