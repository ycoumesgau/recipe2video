"use client";

import { AlertTriangle, Download, Sparkles, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CanonicalReferenceThumbnails } from "@/modules/references/ui/canonical-reference-thumbnails";
import { ArtifactImageCard } from "@/modules/shared/ui/artifact-image-card";

import {
  generateSongCoverAction,
  selectSongCoverVariantAction,
  updateSongCoverImageReferencesAction,
  updateSongCoverPromptAction,
  uploadSongCoverManualOverrideAction,
} from "../actions";
import type { SongCoverArtifactReview } from "../song-cover.types";

export function AlbumCoverCard({
  review,
  videoId,
}: {
  review: SongCoverArtifactReview;
  videoId: string;
}) {
  const { artifact } = review;
  const isGenerating = artifact.status === "generating";

  return (
    <ArtifactImageCard
      aspectRatioClassName="aspect-square"
      badges={<Badge variant="outline">Album cover</Badge>}
      isGenerating={isGenerating}
      previewAlt="Album cover preview"
      previewUrl={review.previewUrl ?? null}
      runwayProgress={artifact.runwayProgress}
      runwayTaskStatus={artifact.runwayTaskStatus}
      status={artifact.status}
      subtitle="Square 1:1 streaming artwork, upscaled to 3000x3000 at download."
      title="Album cover"
    >
      {review.unresolvedImageReferences.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unresolved references</AlertTitle>
          <AlertDescription>
            These names do not match anything in the asset library nor in this
            video&apos;s reference plan and will be skipped at generation
            time: {review.unresolvedImageReferences.join(", ")}.
          </AlertDescription>
        </Alert>
      ) : null}

      <details className="rounded-lg border bg-background/60 p-3 text-xs" open>
        <summary className="cursor-pointer font-medium">Prompt</summary>
        <form
          action={updateSongCoverPromptAction}
          className="mt-3 space-y-2"
        >
          <input name="videoId" type="hidden" value={videoId} />
          <input name="artifactId" type="hidden" value={artifact.id} />
          <Textarea
            defaultValue={artifact.prompt}
            name="prompt"
            placeholder="Square cover prompt with @-tagged anchors and food-porn direction."
            rows={6}
          />
          <Button size="sm" type="submit" variant="outline">
            Save prompt
          </Button>
        </form>
      </details>

      <details className="rounded-lg border bg-background/60 p-3 text-xs">
        <summary className="cursor-pointer font-medium">
          Conditioning references ({artifact.imageReferenceCanonicalNames.length})
        </summary>
        <p className="mt-2 text-muted-foreground">
          Each name resolves to a global library entry or to a recipe-specific
          reference declared in <code>reference-plan.json</code>. Character
          anchors are allowed here — the mascot is the hero of the artwork.
        </p>
        <CanonicalReferenceThumbnails items={review.imageReferencePreviews} />
        <form
          action={updateSongCoverImageReferencesAction}
          className="mt-3 space-y-2"
        >
          <input name="videoId" type="hidden" value={videoId} />
          <input name="artifactId" type="hidden" value={artifact.id} />
          <Label
            className="text-[11px] uppercase text-muted-foreground"
            htmlFor={`cover-refs-${artifact.id}`}
          >
            Canonical names
          </Label>
          <Textarea
            defaultValue={artifact.imageReferenceCanonicalNames.join(", ")}
            id={`cover-refs-${artifact.id}`}
            name="imageReferenceCanonicalNames"
            placeholder="KitchenIslandDefault, CharacterSheet, FinalDishVisual"
            rows={2}
          />
          <Button size="sm" type="submit" variant="outline">
            Save references
          </Button>
        </form>
      </details>

      {review.variants.length > 1 ? (
        <details className="rounded-lg border bg-background/60 p-3 text-xs" open>
          <summary className="cursor-pointer font-medium">
            Variants history ({review.variants.length})
          </summary>
          <div className="mt-3 space-y-2">
            {review.variants.map((variant, index) => (
              <div
                className="flex items-start gap-2 rounded-md border p-2"
                key={variant.mediaAsset.id}
              >
                {variant.previewUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    alt={`Variant ${index + 1}`}
                    className="h-16 w-16 shrink-0 rounded object-cover"
                    src={variant.previewUrl}
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-dashed bg-muted/40 text-muted-foreground">
                    ?
                  </div>
                )}
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
          <input name="kind" type="hidden" value="album_cover" />
          <Button disabled={isGenerating} size="sm" type="submit">
            <Sparkles className="h-4 w-4" />
            {isGenerating
              ? "Generating…"
              : review.previewUrl
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
            <input accept="image/*" name="file" type="file" />
            <Button size="sm" type="submit" variant="outline">
              <Upload className="h-4 w-4" />
              Upload override
            </Button>
          </label>
        </form>

        {review.previewUrl ? (
          <Button asChild size="sm" variant="outline">
            <a
              href={`/api/song-cover/${videoId}/album-cover/download`}
              rel="noopener"
              target="_blank"
            >
              <Download className="h-4 w-4" />
              Download 3000x3000 JPEG
            </a>
          </Button>
        ) : null}
      </div>
    </ArtifactImageCard>
  );
}
