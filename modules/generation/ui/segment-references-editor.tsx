"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RUNWAY_MAX_SEEDANCE_REFERENCES } from "@/modules/generation/runway.constants";
import type {
  SegmentReferenceEditorRow,
  SegmentReferencePickerOption,
  SegmentReferenceResolutionItem,
} from "@/modules/generation/use-cases/get-segment-review";

import { updateSegmentReferencesAction } from "../actions";

type DraftRow = SegmentReferenceEditorRow & { clientKey: string };

function toDraftRow(row: SegmentReferenceEditorRow, index: number): DraftRow {
  return {
    ...row,
    clientKey: `${row.libraryAssetId ?? row.recipeReferenceId ?? "row"}-${index}`,
  };
}

function emptyDraftRow(): DraftRow {
  return {
    clientKey: `new-${crypto.randomUUID()}`,
    libraryAssetId: null,
    recipeReferenceId: null,
    role: "",
    required: true,
    canonicalName: "",
    displayLabel: "",
    source: "reference_assets",
    hasStorage: false,
    recipeReferenceStatus: null,
  };
}

function pickerKeyForRow(row: DraftRow): string | null {
  if (row.libraryAssetId) {
    return `library:${row.libraryAssetId}`;
  }
  if (row.recipeReferenceId) {
    return `recipe:${row.recipeReferenceId}`;
  }
  return null;
}

function applyPickerOption(
  row: DraftRow,
  option: SegmentReferencePickerOption,
): DraftRow {
  return {
    ...row,
    libraryAssetId: option.libraryAssetId,
    recipeReferenceId: option.recipeReferenceId,
    canonicalName: option.canonicalName,
    displayLabel: option.label,
    source: option.source,
    hasStorage: false,
    recipeReferenceStatus: null,
  };
}

export function SegmentReferencesEditor({
  initialRows,
  pickerOptions,
  resolutions,
  segmentId,
  videoId,
}: {
  initialRows: SegmentReferenceEditorRow[];
  pickerOptions: SegmentReferencePickerOption[];
  resolutions: SegmentReferenceResolutionItem[];
  segmentId: string;
  videoId: string;
}) {
  const [rows, setRows] = useState(() =>
    initialRows.length > 0
      ? initialRows.map(toDraftRow)
      : [],
  );

  const usedPickerKeys = useMemo(
    () =>
      new Set(
        rows
          .map(pickerKeyForRow)
          .filter((key): key is string => Boolean(key)),
      ),
    [rows],
  );

  const unresolvedDeclarations = resolutions.filter(
    (resolution) => !resolution.resolvedCanonicalName,
  );

  const payloadJson = JSON.stringify(
    rows
      .filter(
        (row) =>
          Boolean(row.libraryAssetId) || Boolean(row.recipeReferenceId),
      )
      .map((row) => ({
        libraryAssetId: row.libraryAssetId,
        recipeReferenceId: row.recipeReferenceId,
        role: row.role,
        required: row.required,
      })),
  );

  const canAddMore = rows.length < RUNWAY_MAX_SEEDANCE_REFERENCES;

  return (
    <Card>
      <CardHeader>
        <CardTitle>References</CardTitle>
        <CardDescription>
          Choose which library and recipe-specific assets Seedance receives for
          this segment. Save updates both the database links and the declared
          reference list used at generation time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {unresolvedDeclarations.length > 0 ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium">Declared but not wired</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {unresolvedDeclarations.map((resolution) => (
                <li key={resolution.declaredName}>
                  {resolution.declaredLabel} ({resolution.role})
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Saving this panel replaces the reference list with the rows below.
            </p>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No references are attached. Add at least one asset before launching
            Seedance.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row, index) => (
              <SegmentReferenceDraftCard
                key={row.clientKey}
                canMoveDown={index < rows.length - 1}
                canMoveUp={index > 0}
                index={index}
                onChange={(next) =>
                  setRows((current) =>
                    current.map((candidate) =>
                      candidate.clientKey === row.clientKey ? next : candidate,
                    ),
                  )
                }
                onMoveDown={() =>
                  setRows((current) => {
                    const copy = [...current];
                    const next = copy[index + 1];
                    const currentRow = copy[index];
                    if (!next || !currentRow) return current;
                    copy[index] = next;
                    copy[index + 1] = currentRow;
                    return copy;
                  })
                }
                onMoveUp={() =>
                  setRows((current) => {
                    const copy = [...current];
                    const previous = copy[index - 1];
                    const currentRow = copy[index];
                    if (!previous || !currentRow) return current;
                    copy[index - 1] = currentRow;
                    copy[index] = previous;
                    return copy;
                  })
                }
                onRemove={() =>
                  setRows((current) =>
                    current.filter(
                      (candidate) => candidate.clientKey !== row.clientKey,
                    ),
                  )
                }
                pickerOptions={pickerOptions}
                row={row}
                usedPickerKeys={usedPickerKeys}
                videoId={videoId}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!canAddMore}
            onClick={() => setRows((current) => [...current, emptyDraftRow()])}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add reference
          </Button>
          <span className="self-center text-xs text-muted-foreground">
            {rows.length}/{RUNWAY_MAX_SEEDANCE_REFERENCES} Runway slots
          </span>
        </div>

        <form action={updateSegmentReferencesAction} className="space-y-2">
          <input name="videoId" type="hidden" value={videoId} />
          <input name="segmentId" type="hidden" value={segmentId} />
          <input name="referencesJson" type="hidden" value={payloadJson} />
          <Button type="submit">Save references</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SegmentReferenceDraftCard({
  row,
  index,
  pickerOptions,
  usedPickerKeys,
  videoId,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  row: DraftRow;
  index: number;
  pickerOptions: SegmentReferencePickerOption[];
  usedPickerKeys: Set<string>;
  videoId: string;
  onChange: (row: DraftRow) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const selectedKey = pickerKeyForRow(row);
  const status = statusForDraftRow(row);

  const libraryOptions = pickerOptions.filter(
    (option) => option.isLibraryGlobal,
  );
  const recipeOptions = pickerOptions.filter(
    (option) => !option.isLibraryGlobal,
  );

  return (
    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">#{index + 1}</Badge>
        {row.source === "asset_library" ? (
          <Badge variant="secondary">Library</Badge>
        ) : (
          <Badge variant="outline">Recipe</Badge>
        )}
        <Badge className="ml-auto" variant={status.variant}>
          {status.label}
        </Badge>
        <div className="flex gap-1">
          <Button
            aria-label="Move reference up"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Move reference down"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Remove reference"
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Asset</Label>
          <Select
            onValueChange={(pickerKey) => {
              const option = pickerOptions.find(
                (candidate) => candidate.pickerKey === pickerKey,
              );
              if (option) {
                onChange(applyPickerOption(row, option));
              }
            }}
            value={selectedKey ?? undefined}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a library or recipe reference" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Library globals</SelectLabel>
                {libraryOptions.map((option) => (
                  <SelectItem
                    disabled={
                      usedPickerKeys.has(option.pickerKey) &&
                      option.pickerKey !== selectedKey
                    }
                    key={option.pickerKey}
                    value={option.pickerKey}
                  >
                    {option.label}
                    {option.canonicalName !== option.label
                      ? ` (${option.canonicalName})`
                      : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Recipe-specific</SelectLabel>
                {recipeOptions.map((option) => (
                  <SelectItem
                    disabled={
                      usedPickerKeys.has(option.pickerKey) &&
                      option.pickerKey !== selectedKey
                    }
                    key={option.pickerKey}
                    value={option.pickerKey}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`role-${row.clientKey}`}>Role</Label>
          <Input
            id={`role-${row.clientKey}`}
            onChange={(event) =>
              onChange({ ...row, role: event.target.value })
            }
            placeholder="e.g. kitchen context, dish anchor"
            value={row.role}
          />
        </div>

        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              checked={row.required}
              onChange={(event) =>
                onChange({ ...row, required: event.target.checked })
              }
              type="checkbox"
            />
            Required for Seedance
          </label>
        </div>
      </div>

      {row.recipeReferenceId ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Edit the image or prompt on the{" "}
          <Link
            className="underline"
            href={`/videos/${videoId}/references`}
          >
            references page
          </Link>
          .
        </p>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">{status.description}</p>
    </div>
  );
}

function statusForDraftRow(row: DraftRow): {
  label: string;
  description: string;
  variant: "default" | "secondary" | "destructive" | "outline" | "warning";
} {
  if (!row.libraryAssetId && !row.recipeReferenceId) {
    return {
      label: "pick asset",
      description: "Select a library or recipe reference before saving.",
      variant: "outline",
    };
  }

  if (row.recipeReferenceStatus === "generating") {
    return {
      label: "image generating",
      description:
        "GPT-Image 2 is still running for this recipe-specific anchor.",
      variant: "warning",
    };
  }

  if (!row.hasStorage && row.source === "reference_assets") {
    return {
      label: "no storage",
      description:
        "Approve or upload this recipe reference before launching Seedance.",
      variant: "destructive",
    };
  }

  if (row.source === "asset_library") {
    return {
      label: "ready · library",
      description:
        "Library globals stream to Runway with a fresh signed URL at generation time.",
      variant: "default",
    };
  }

  return {
    label: "ready · recipe",
    description: "This recipe-specific reference is wired for Seedance.",
    variant: "default",
  };
}
