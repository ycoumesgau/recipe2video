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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createVideoDraftAction,
  type NewVideoWizardActionState,
} from "@/modules/videos/actions";
import {
  CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL,
  CURSOR_AGENT_MODEL_OPTIONS,
  CURSOR_AGENT_REASONING_OPTIONS,
  DEFAULT_CURSOR_AGENT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_SFX_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODEL_OPTIONS,
  MAX_COMPLEMENTARY_AGENT_INSTRUCTIONS_LENGTH,
  MAX_RECIPE_SOURCE_FILE_SIZE_BYTES,
  MAX_VIDEO_TITLE_LENGTH,
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
  const [selectedCursorAgentModel, setSelectedCursorAgentModel] = useState(
    DEFAULT_CURSOR_AGENT_MODEL
  );

  const totalFileSize = useMemo(
    () => selectedFiles.reduce((total, file) => total + file.size, 0),
    [selectedFiles]
  );
  const hasOversizedFile = selectedFiles.some(
    (file) => file.size > MAX_RECIPE_SOURCE_FILE_SIZE_BYTES
  );
  const cursorAgentReasoningOptions =
    CURSOR_AGENT_REASONING_OPTIONS[
      selectedCursorAgentModel as keyof typeof CURSOR_AGENT_REASONING_OPTIONS
    ] ?? [];
  const cursorAgentDefaultReasoning =
    CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL[
      selectedCursorAgentModel as keyof typeof CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL
    ];
  const cursorAgentReasoningDefaultValue =
    cursorAgentReasoningOptions.find(
      (option) => option.value === cursorAgentDefaultReasoning,
    )?.value ?? cursorAgentReasoningOptions[0]?.value;

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
          <CardTitle>Recipe title</CardTitle>
          <CardDescription>
            Optional. When set, this becomes the project name. Leave blank to
            derive a title from the URL, pasted text, or demo selection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="recipeTitle">Display name</Label>
            <Input
              id="recipeTitle"
              name="recipeTitle"
              autoComplete="off"
              maxLength={MAX_VIDEO_TITLE_LENGTH}
              placeholder="e.g. Chicken enchiladas"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Step 1</Badge>
            <CardTitle>Recipe source</CardTitle>
          </div>
          <CardDescription>
            Add at least one source. The draft is persisted immediately; recipe
            analysis is handled by the persistent recipe agent when you choose
            the analyze action.
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
                  URL analysis is sent to the persistent recipe agent after the
                  draft is created.
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
                <Select defaultValue="__no_demo" name="demoRecipeId">
                  <SelectTrigger id="demoRecipeId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__no_demo">No demo recipe</SelectItem>
                    <SelectItem value="paris-brest">Paris-Brest fixture</SelectItem>
                  </SelectContent>
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
          <CardTitle>Complementary instructions for the recipe agent</CardTitle>
          <CardDescription>
            Optional. Use this for constraints the models should respect from the
            first planning pass (for example target size for shaped dishes). When
            you choose “Create project and analyze recipe”, these notes
            are included verbatim in the initial agent message.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="complementaryAgentInstructions">Agent notes</Label>
            <Textarea
              id="complementaryAgentInstructions"
              name="complementaryAgentInstructions"
              maxLength={MAX_COMPLEMENTARY_AGENT_INSTRUCTIONS_LENGTH}
              placeholder='e.g. For arancini, show a ball about 5–6 cm in diameter so scale stays consistent across shots.'
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank if you have nothing specific to add. Saved on the draft
              and sent with the first analysis request only.
            </p>
          </div>
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
            defaultValue="auto"
            label="Target duration"
            name="targetDurationSeconds"
            options={TARGET_DURATION_OPTIONS}
          />
          <SelectField
            defaultValue={DEFAULT_CURSOR_AGENT_MODEL}
            label="Cursor agent model"
            name="cursorAgentModel"
            onValueChange={setSelectedCursorAgentModel}
            options={CURSOR_AGENT_MODEL_OPTIONS}
          />
          {cursorAgentReasoningOptions.length > 0 &&
          cursorAgentReasoningDefaultValue ? (
            <SelectField
              defaultValue={cursorAgentReasoningDefaultValue}
              key={`cursor-reasoning-${selectedCursorAgentModel}`}
              label="Cursor agent reasoning"
              name="cursorAgentReasoning"
              options={cursorAgentReasoningOptions}
            />
          ) : (
            <NonConfigurableField
              label="Cursor agent reasoning"
              message="Not configurable for this model"
              name="cursorAgentReasoning"
            />
          )}
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
            <AlertTitle>No Runway generation on submit</AlertTitle>
            <AlertDescription>
              Analyze queues the Cursor recipe agent to update planning
              artifacts. Seedance generation remains a separate approved
              checkpoint.
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

function NonConfigurableField({
  label,
  message,
  name,
}: {
  label: string;
  message: string;
  name: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`${name}-disabled`}>{label}</Label>
      <Input disabled id={`${name}-disabled`} value={message} />
      <input name={name} type="hidden" value="" />
    </div>
  );
}

function SelectField({
  defaultValue,
  label,
  name,
  onValueChange,
  options,
}: {
  defaultValue: string;
  label: string;
  name: string;
  onValueChange?: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Select defaultValue={defaultValue} name={name} onValueChange={onValueChange}>
        <SelectTrigger id={name}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
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
