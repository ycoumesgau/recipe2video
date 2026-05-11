import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  ImageOff,
  Info,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  createLibraryAssetAction,
  deprecateLibraryAssetAction,
  reactivateLibraryAssetAction,
  replaceLibraryAssetMediaAction,
  republishAssetReferenceSkillAction,
  updateLibraryAssetMetadataAction,
} from "@/modules/library/actions";
import {
  ASSET_LIBRARY_CATEGORIES,
  ASSET_LIBRARY_CATEGORY_DISPLAY,
  type AssetLibraryCategory,
} from "@/modules/library/library.constants";
import {
  getLibraryAdminData,
  type LibraryAdminItem,
} from "@/modules/library/use-cases/list-library-for-admin";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; message?: string }>;
}) {
  const query = await searchParams;
  const supabase = createSupabaseAdminClient();
  const data = await getLibraryAdminData(supabase);

  const activeByCategory = groupByCategory(
    data.items.filter((item) => item.entry.status === "active"),
  );
  const deprecated = data.items.filter(
    (item) => item.entry.status === "deprecated",
  );

  const notice = getNotice(query);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge className="mb-3" variant="outline">
            Global library
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight">
            Asset library
          </h2>
          <p className="max-w-3xl text-muted-foreground">
            Canonical kitchen / character / pose / expression / utensil assets
            shared across every recipe. Changes here are saved to Supabase
            Storage AND committed to the agent workspace skill so the next
            agent run picks them up.
          </p>
        </div>
        <form action={republishAssetReferenceSkillAction}>
          <Button
            disabled={!data.skillAutoPushEnabled}
            type="submit"
            variant="outline"
          >
            <GitBranch className="mr-2 h-4 w-4" />
            Republish skill
          </Button>
        </form>
      </header>

      {notice ? (
        <Alert variant={notice.type === "error" ? "destructive" : "default"}>
          {notice.type === "error" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertTitle>
            {notice.type === "error" ? "Library action failed" : "Library updated"}
          </AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      {!data.skillAutoPushEnabled ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Skill auto-push disabled</AlertTitle>
          <AlertDescription>
            {data.skillAutoPushNote}{" "}
            Library mutations still persist to Supabase, but the regenerated{" "}
            <code>SKILL.md</code> won&apos;t be committed to the agent
            workspace until you set <code>CURSOR_AGENT_REPO_URL</code> and a
            GitHub PAT with <code>Contents: Write</code>.
          </AlertDescription>
        </Alert>
      ) : null}

      <CreateAssetForm />

      <Separator />

      {ASSET_LIBRARY_CATEGORIES.map((category) => {
        const items = activeByCategory[category] ?? [];
        if (items.length === 0) return null;

        return (
          <section key={category} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold tracking-tight">
                {ASSET_LIBRARY_CATEGORY_DISPLAY[category]}
              </h3>
              <Badge variant="secondary">{items.length}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <LibraryAssetCard key={item.entry.id} item={item} />
              ))}
            </div>
          </section>
        );
      })}

      {deprecated.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold tracking-tight text-muted-foreground">
              Deprecated
            </h3>
            <Badge variant="outline">{deprecated.length}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Deprecated entries no longer appear in the agent skill or in the
            resolver. They remain in storage so existing videos that link to
            them keep rendering.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {deprecated.map((item) => (
              <LibraryAssetCard key={item.entry.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState />
      ) : null}
    </div>
  );
}

function groupByCategory(
  items: LibraryAdminItem[],
): Partial<Record<AssetLibraryCategory, LibraryAdminItem[]>> {
  const grouped: Partial<Record<AssetLibraryCategory, LibraryAdminItem[]>> = {};
  for (const item of items) {
    const category = item.entry.category as AssetLibraryCategory;
    if (!grouped[category]) grouped[category] = [];
    grouped[category]!.push(item);
  }
  return grouped;
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Library is empty</CardTitle>
        <CardDescription>
          Seed the canonical assets from the agent workspace by running{" "}
          <code>npm run seed:asset-library</code>, or create the first entry
          using the form above.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function CreateAssetForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a global asset</CardTitle>
        <CardDescription>
          PNG only. The canonical name is permanent — pick something stable
          and snake_case-friendly (the file will live at{" "}
          <code>library/&lt;category&gt;/&lt;canonical_name&gt;.png</code>).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={createLibraryAssetAction}
          className="grid gap-4 md:grid-cols-2"
          encType="multipart/form-data"
        >
          <div className="space-y-2">
            <Label htmlFor="create-canonical">canonical_name</Label>
            <Input
              id="create-canonical"
              name="canonicalName"
              placeholder="e.g. island_corner_closeup"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-category">Category</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              defaultValue="kitchen"
              id="create-category"
              name="category"
              required
            >
              {ASSET_LIBRARY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {ASSET_LIBRARY_CATEGORY_DISPLAY[category]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="create-aliases">
              Aliases{" "}
              <span className="text-muted-foreground">
                (comma- or space-separated, optional)
              </span>
            </Label>
            <Input
              id="create-aliases"
              name="aliases"
              placeholder="KitchenIslandCornerCloseup IslandCorner"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="create-description">Description</Label>
            <Textarea
              id="create-description"
              name="description"
              placeholder="What does this asset show? Surface any naming pitfalls so the agent picks it correctly."
              rows={3}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="create-file">PNG file</Label>
            <Input
              accept="image/png"
              id="create-file"
              name="file"
              required
              type="file"
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit">Create asset</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function LibraryAssetCard({ item }: { item: LibraryAdminItem }) {
  const { entry } = item;
  const isDeprecated = entry.status === "deprecated";

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-video w-full bg-muted">
        {item.previewUrl ? (
          <Image
            alt={entry.canonicalName}
            className="object-cover"
            fill
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
            src={item.previewUrl}
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
        {isDeprecated ? (
          <Badge className="absolute right-2 top-2" variant="outline">
            Deprecated
          </Badge>
        ) : null}
      </div>
      <CardHeader>
        <CardTitle className="text-base">
          @{entry.aliases[0] || entry.canonicalName}
        </CardTitle>
        <CardDescription>
          <code>{entry.canonicalName}</code>
          {entry.aliases.length > 0 ? (
            <span className="ml-2 text-xs">
              · aliases: {entry.aliases.join(", ")}
            </span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {entry.description ? (
          <p className="text-muted-foreground">{entry.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">
            {ASSET_LIBRARY_CATEGORY_DISPLAY[entry.category as AssetLibraryCategory] ??
              entry.category}
          </Badge>
          <Badge variant="outline">used in {item.usageCount} segment(s)</Badge>
          {item.fileSizeBytes ? (
            <span>{formatFileSize(item.fileSizeBytes)}</span>
          ) : null}
          {item.storagePath ? (
            <span className="break-all">{item.storagePath}</span>
          ) : null}
        </div>

        <details className="rounded-md border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Edit metadata
          </summary>
          <form
            action={updateLibraryAssetMetadataAction}
            className="mt-3 space-y-3"
          >
            <input name="assetLibraryId" type="hidden" value={entry.id} />
            <div className="space-y-2">
              <Label htmlFor={`category-${entry.id}`}>Category</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                defaultValue={entry.category}
                id={`category-${entry.id}`}
                name="category"
              >
                {ASSET_LIBRARY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {ASSET_LIBRARY_CATEGORY_DISPLAY[category]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`aliases-${entry.id}`}>Aliases</Label>
              <Input
                defaultValue={entry.aliases.join(" ")}
                id={`aliases-${entry.id}`}
                name="aliases"
                placeholder="comma or space separated, e.g. KitchenIslandDefault"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`description-${entry.id}`}>Description</Label>
              <Textarea
                defaultValue={entry.description ?? ""}
                id={`description-${entry.id}`}
                name="description"
                rows={3}
              />
            </div>
            <Button size="sm" type="submit">
              Save metadata
            </Button>
          </form>
        </details>

        <details className="rounded-md border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Replace image
          </summary>
          <form
            action={replaceLibraryAssetMediaAction}
            className="mt-3 space-y-3"
            encType="multipart/form-data"
          >
            <input name="assetLibraryId" type="hidden" value={entry.id} />
            <Input accept="image/png" name="file" required type="file" />
            <Button size="sm" type="submit" variant="secondary">
              Replace PNG
            </Button>
          </form>
        </details>

        <div className="flex flex-wrap gap-2 pt-1">
          {isDeprecated ? (
            <form action={reactivateLibraryAssetAction}>
              <input name="assetLibraryId" type="hidden" value={entry.id} />
              <Button size="sm" type="submit" variant="outline">
                Reactivate
              </Button>
            </form>
          ) : (
            <form action={deprecateLibraryAssetAction}>
              <input name="assetLibraryId" type="hidden" value={entry.id} />
              <Button size="sm" type="submit" variant="destructive">
                Deprecate
              </Button>
            </form>
          )}
          {item.previewUrl ? (
            <Button asChild size="sm" variant="ghost">
              <Link
                href={item.previewUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                Open image
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getNotice(query: {
  notice?: string;
  message?: string;
}): { type: "success" | "error"; message: string } | null {
  if (
    (query.notice !== "success" && query.notice !== "error") ||
    !query.message
  ) {
    return null;
  }
  return { type: query.notice, message: query.message };
}
