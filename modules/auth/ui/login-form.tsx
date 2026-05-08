"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";

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
import {
  type LoginFormState,
  sendMagicLinkAction,
} from "../auth.actions";

const defaultState: LoginFormState = {
  status: "idle",
};

export function LoginForm({
  initialState = defaultState,
}: {
  initialState?: LoginFormState;
}) {
  const [state, formAction] = useActionState(
    sendMagicLinkAction,
    initialState,
  );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Recipe2Video</CardTitle>
        <CardDescription>Internal Licorn access only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input
              autoComplete="email"
              id="email"
              name="email"
              placeholder="you@licorn.example"
              required
              type="email"
            />
          </div>
          <SubmitButton />
        </form>

        <LoginStatusAlert state={state} />

        <p className="text-sm text-muted-foreground">
          Only approved Licorn emails can access this application.
        </p>
      </CardContent>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" disabled={pending} type="submit">
      {pending ? "Sending magic link..." : "Send magic link"}
    </Button>
  );
}

function LoginStatusAlert({ state }: { state: LoginFormState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  if (state.status === "success") {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Magic link sent</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>
        {state.status === "unauthorized" ? "Not authorized" : "Login failed"}
      </AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}
