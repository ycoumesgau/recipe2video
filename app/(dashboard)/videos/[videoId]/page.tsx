import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;

  return (
    <div className="space-y-6">
      <div>
        <Badge className="mb-3" variant="outline">
          Project {videoId}
        </Badge>
        <h2 className="text-3xl font-semibold tracking-tight">
          Project overview
        </h2>
        <p className="text-muted-foreground">
          This placeholder reserves the cockpit structure for storyboard,
          references, segments, assembly, costs, and logs.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="storyboard">Storyboard</TabsTrigger>
          <TabsTrigger value="references">References</TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="assembly">Assembly</TabsTrigger>
          <TabsTrigger value="costs">Costs and Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Next required action</CardTitle>
              <CardDescription>
                Once Supabase is wired, this screen will answer what is
                happening, what is blocked, and what the user should do next.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              No project data is loaded in Issue #1.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
