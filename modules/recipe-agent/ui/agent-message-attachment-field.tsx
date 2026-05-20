"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENT_MESSAGE_ATTACHMENT_ACCEPT,
  MAX_AGENT_MESSAGE_ATTACHMENTS,
} from "@/modules/media-assets/media-asset.constants";
import { MAX_RECIPE_SOURCE_FILE_SIZE_BYTES } from "@/modules/videos/video.constants";

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AgentMessageAttachmentField({
  textareaId,
  textareaName,
  fileInputName,
  label,
  placeholder,
  rows = 4,
  maxLength,
  helperText,
}: {
  textareaId: string;
  textareaName: string;
  fileInputName: string;
  label: string;
  placeholder: string;
  rows?: number;
  maxLength?: number;
  helperText?: string;
}) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const totalSize = useMemo(
    () => selectedFiles.reduce((sum, file) => sum + file.size, 0),
    [selectedFiles],
  );
  const hasOversizedFile = selectedFiles.some(
    (file) => file.size > MAX_RECIPE_SOURCE_FILE_SIZE_BYTES,
  );
  const atLimit = selectedFiles.length >= MAX_AGENT_MESSAGE_ATTACHMENTS;

  function syncFileInput(files: File[]) {
    const input = fileInputRef.current;
    if (!input) {
      return;
    }

    const transfer = new DataTransfer();
    for (const file of files) {
      transfer.items.add(file);
    }
    input.files = transfer.files;
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming?.length) {
      return;
    }

    setSelectedFiles((previous) => {
      const merged = [...previous];
      for (const file of Array.from(incoming)) {
        if (merged.length >= MAX_AGENT_MESSAGE_ATTACHMENTS) {
          break;
        }
        if (file.size > 0 && file.name.length > 0) {
          merged.push(file);
        }
      }
      syncFileInput(merged);
      return merged;
    });
  }

  function removeFile(index: number) {
    setSelectedFiles((previous) => {
      const next = previous.filter((_, i) => i !== index);
      syncFileInput(next);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={textareaId}>{label}</Label>
      <div className="relative">
        <Textarea
          className="min-h-[7rem] resize-y pb-10 pr-12"
          id={textareaId}
          maxLength={maxLength}
          name={textareaName}
          placeholder={placeholder}
          rows={rows}
        />
        <input
          accept={AGENT_MESSAGE_ATTACHMENT_ACCEPT}
          className="sr-only"
          id={fileInputId}
          multiple
          name={fileInputName}
          onChange={(event) => addFiles(event.target.files)}
          ref={fileInputRef}
          type="file"
        />
        <Button
          aria-label="Attach images for the recipe agent"
          className="absolute bottom-2 right-2 h-8 w-8 shrink-0"
          disabled={atLimit}
          onClick={() => fileInputRef.current?.click()}
          size="icon"
          title={
            atLimit
              ? `Maximum ${MAX_AGENT_MESSAGE_ATTACHMENTS} images`
              : "Attach JPG, PNG, or WebP (Cursor SDK vision)"
          }
          type="button"
          variant="outline"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
      </div>

      {selectedFiles.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs">
          {selectedFiles.map((file, index) => (
            <li
              className="flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-2 py-1"
              key={`${file.name}-${file.size}-${index}`}
            >
              <span className="truncate">{file.name}</span>
              <span className="text-muted-foreground">({formatBytes(file.size)})</span>
              <button
                aria-label={`Remove ${file.name}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => removeFile(index)}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {hasOversizedFile ? (
        <p className="text-xs text-destructive">
          One or more files exceed the 16 MB limit.
        </p>
      ) : null}

      {helperText ? (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Optional. Attach up to {MAX_AGENT_MESSAGE_ATTACHMENTS} images (JPG, PNG,
          WebP). Sent to the Cursor agent as vision input
          {selectedFiles.length > 0
            ? ` · ${selectedFiles.length} selected (${formatBytes(totalSize)} total)`
            : ""}
          .
        </p>
      )}
    </div>
  );
}
