"use client";

import type { ReactNode } from "react";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, FileImage, Info, Loader2 } from "lucide-react";

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
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createVideoDraftAction,
  type NewVideoWizardActionState,
} from "@/modules/videos/actions";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_SFX_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODEL_OPTIONS,
  MAX_RECIPE_SOURCE_FILE_SIZE_BYTES,
  SFX_MODEL_OPTIONS,
  STYLE_PRESET_OPTIONS,
  TARGET_DURATION_OPTIONS,
  TTS_MODEL_OPTIONS,
  VIDEO_MODEL_OPTIONS,
} from "@/modules/videos/video.constants";

const initialState: NewVideoWizardActionState = {
  message: undefined,
};

export function NewVideoWizardForm() {
  const [state, formAction] = useActionState(
    createVideoDraftAction,
    initialState
  );
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const totalFileSize = useMemo(
    () => selectedFiles.reduce((total, file) => total + file.size, 0),
    [selectedFiles]
  );
  const hasOversizedFile = selectedFiles.some(
    (file) => file.size > MAX_RECIPE_SOURCE_FILE_SIZE_BYTES
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.message ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to create draft</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Step 1</Badge>
            <CardTitle>Recipe source</CardTitle>
          </div>
          <CardDescription>
            Add at least one source. The draft is persisted immediately; recipe
            extraction is intentionally not triggered by this issue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="url">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="url">URL</TabsTrigger>
              <TabsTrigger value="photos">Photos</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="demo">Demo recipe</TabsTrigger>
            </TabsList>

            <TabsContent className="space-y-3 pt-4" value="url">
              <div className="space-y-2">
                <Label htmlFor="recipeUrl">Recipe URL</Label>
                <Input
                  id="recipeUrl"
                  name="recipeUrl"
                  placeholder="https://example.com/recipe"
                  type="url"
                />
                <p className="text-xs text-muted-foreground">
                  URL extraction will be handled by the recipe ingest workflow
                  in a later issue.
                </p>
              </div>
            </TabsContent>

            <TabsContent className="space-y-3 pt-4" value="photos">
              <div className="rounded-lg border border-dashed p-4">
                <Label
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 text-center"
                  htmlFor="recipePhotos"
                >
                  <FileImage className="h-8 w-8 text-muted-foreground" />
                  <span>Upload recipe, dish, ingredient, or step photos</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    JPG, PNG, or WebP. Keep each file under 16 MB.
                  </span>
                </Label>
                <Input
                  accept="image/jpeg,image/png,image/webp"
                  className="mt-4"
                  id="recipePhotos"
                  multiple
                  name="recipePhotos"
                  onChange={(event) =>
                    setSelectedFiles(Array.from(event.target.files ?? []))
                  }
                  type="file"
                />
              </div>
              {selectedFiles.length > 0 ? (
                <div className="rounded-lg border bg-card/50 p-3 text-sm">
                  <p className="font-medium">
                    {selectedFiles.length} file
                    {selectedFiles.length === 1 ? "" : "s"} selected
                  </p>
                  <p className="text-muted-foreground">
                    Total size: {formatBytes(totalFileSize)}
                  </p>
                  {hasOversizedFile ? (
                    <p className="mt-2 text-destructive">
                      One or more files exceed the 16 MB limit.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent className="space-y-3 pt-4" value="text">
              <div className="space-y-2">
                <Label htmlFor="pastedRecipeText">Pasted recipe text</Label>
                <Textarea
                  id="pastedRecipeText"
                  name="pastedRecipeText"
                  placeholder="Paste ingredients, method, timing, and any notes that should guide the storyboard."
                  rows={8}
                />
              </div>
            </TabsContent>

            <TabsContent className="space-y-3 pt-4" value="demo">
              <div className="space-y-2">
                <Label htmlFor="demoRecipeId">Demo recipe</Label>
                <Select id="demoRecipeId" name="demoRecipeId">
                  <option value="">No demo recipe</option>
                  <option value="paris-brest">Paris-Brest fixture</option>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Demo mode data is handled separately; this option only marks
                  the new draft as a demo recipe source.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Step 2</Badge>
            <CardTitle>Production defaults</CardTitle>
          </div>
          <CardDescription>
            Selected models are stored on the draft. No generation starts from
            this screen.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <SelectField
            defaultValue="60"
            label="Target duration"
            name="targetDurationSeconds"
            options={TARGET_DURATION_OPTIONS}
          />
          <SelectField
            defaultValue="asmr_food"
            label="Style preset"
            name="stylePreset"
            options={STYLE_PRESET_OPTIONS}
          />
          <SelectField
            defaultValue={DEFAULT_VIDEO_MODEL}
            label="Video model"
            name="selectedVideoModel"
            options={VIDEO_MODEL_OPTIONS}
          />
          <SelectField
            defaultValue={DEFAULT_IMAGE_MODEL}
            label="Image model"
            name="selectedImageModel"
            options={IMAGE_MODEL_OPTIONS}
          />
          <SelectField
            defaultValue={DEFAULT_TTS_MODEL}
            label="TTS model"
            name="selectedTtsModel"
            options={TTS_MODEL_OPTIONS}
          />
          <SelectField
            defaultValue={DEFAULT_SFX_MODEL}
            label="SFX model"
            name="selectedSfxModel"
            options={SFX_MODEL_OPTIONS}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Step 3</Badge>
            <CardTitle>Create</CardTitle>
          </div>
          <CardDescription>
            The draft uses status <code>draft</code> and redirects to the
            project overview after creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>No costly action on submit</AlertTitle>
            <AlertDescription>
              This only stores the recipe source, selected models, and draft
              project metadata. Storyboarding and generation remain separate
              approval checkpoints.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SubmitButton intent="analyze">
              Create project and analyze recipe
            </SubmitButton>
            <SubmitButton intent="draft" variant="outline">
              Save draft
            </SubmitButton>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function SelectField({
  defaultValue,
  label,
  name,
  options,
}: {
  defaultValue: string;
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Select defaultValue={defaultValue} id={name} name={name}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function SubmitButton({
  children,
  intent,
  variant,
}: {
  children: ReactNode;
  intent: "analyze" | "draft";
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      disabled={pending}
      name="intent"
      type="submit"
      value={intent}
      variant={variant}
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}
