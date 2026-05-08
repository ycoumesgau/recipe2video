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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function NewVideoPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Badge className="mb-3" variant="outline">
          Placeholder
        </Badge>
        <h2 className="text-3xl font-semibold tracking-tight">
          Create video
        </h2>
        <p className="text-muted-foreground">
          The production wizard will accept recipe URLs, photos, pasted text,
          and demo fixtures.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recipe source</CardTitle>
          <CardDescription>
            Issue #11 will turn this placeholder into a persisted draft flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="url">
            <TabsList>
              <TabsTrigger value="url">URL</TabsTrigger>
              <TabsTrigger value="photos">Photos</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="demo">Demo fixture</TabsTrigger>
            </TabsList>
            <TabsContent className="space-y-3 pt-4" value="url">
              <Input disabled placeholder="https://example.com/recipe" />
            </TabsContent>
            <TabsContent className="pt-4 text-sm text-muted-foreground" value="photos">
              Photo upload will be implemented after storage helpers exist.
            </TabsContent>
            <TabsContent className="pt-4 text-sm text-muted-foreground" value="text">
              Pasted recipe text input will be implemented with the wizard.
            </TabsContent>
            <TabsContent className="pt-4 text-sm text-muted-foreground" value="demo">
              Paris-Brest fixture selection will be added by demo mode.
            </TabsContent>
          </Tabs>
          <Button disabled>Create project and analyze recipe</Button>
        </CardContent>
      </Card>
    </div>
  );
}
