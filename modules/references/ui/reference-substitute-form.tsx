"use client";

import { Replace } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { substituteReferenceAction } from "../actions";
import type { ReferenceSubstitutePickerOption } from "../reference.types";
import { ReferenceFormSubmitButton } from "./reference-form-submit-button";

export function ReferenceSubstituteForm({
  pickerOptions,
  referenceId,
  videoId,
}: {
  pickerOptions: ReferenceSubstitutePickerOption[];
  referenceId: string;
  videoId: string;
}) {
  const libraryOptions = pickerOptions.filter((option) => option.isLibraryGlobal);
  const recipeOptions = pickerOptions.filter(
    (option) =>
      !option.isLibraryGlobal && option.recipeReferenceId !== referenceId,
  );

  if (libraryOptions.length === 0 && recipeOptions.length === 0) {
    return null;
  }

  return (
    <form action={substituteReferenceAction} className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <input name="videoId" type="hidden" value={videoId} />
      <input name="referenceId" type="hidden" value={referenceId} />
      <div className="space-y-2">
        <Label className="text-xs font-medium">Replace with</Label>
        <Select name="targetPickerKey" required>
          <SelectTrigger>
            <SelectValue placeholder="Choose a library or recipe reference" />
          </SelectTrigger>
          <SelectContent>
            {libraryOptions.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Library globals</SelectLabel>
                {libraryOptions.map((option) => (
                  <SelectItem key={option.pickerKey} value={option.pickerKey}>
                    {option.label}
                    {option.canonicalName !== option.label
                      ? ` (${option.canonicalName})`
                      : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {recipeOptions.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Recipe-specific</SelectLabel>
                {recipeOptions.map((option) => (
                  <SelectItem key={option.pickerKey} value={option.pickerKey}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Rewires segments, storyboard prompts, and conditioning anchors. If the
          replacement is already linked, duplicate rows are removed.
        </p>
      </div>
      <ReferenceFormSubmitButton
        icon={<Replace className="h-4 w-4" />}
        pendingLabel="Replacing…"
        variant="outline"
      >
        Replace reference
      </ReferenceFormSubmitButton>
    </form>
  );
}
