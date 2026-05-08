import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Recipe2Video</CardTitle>
          <CardDescription>Internal Licorn access only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input
              disabled
              id="email"
              placeholder="you@licorn.example"
              type="email"
            />
          </div>
          <Button className="w-full" disabled>
            Send magic link
          </Button>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Supabase auth not wired yet</AlertTitle>
            <AlertDescription>
              Issue #2 will connect Magic Link login and the allowlist.
            </AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            Only approved Licorn emails can access this application.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
