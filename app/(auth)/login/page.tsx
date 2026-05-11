import { redirect } from "next/navigation";

import { ThemeModeDropdown } from "@/components/layout/theme-mode-dropdown";
import { LoginForm } from "@/modules/auth/ui/login-form";
import {
  getCurrentProfile,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import type { LoginFormState } from "@/modules/auth/auth.actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const profile = await getCurrentProfile().catch(async (error) => {
    if (isAuthAccessError(error) && error.code === "unauthorized") {
      redirect("/auth/sign-out?status=unauthorized");
    }

    throw error;
  });

  if (profile) {
    redirect("/");
  }

  const initialState = getInitialState(params.status);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="absolute top-4 right-4 md:top-6 md:right-6">
        <ThemeModeDropdown />
      </div>
      <LoginForm initialState={initialState} />
    </main>
  );
}

function getInitialState(status: string | undefined): LoginFormState {
  if (status === "unauthorized") {
    return {
      status: "unauthorized",
      message: "This email is not authorized to access Recipe2Video.",
    };
  }

  if (status === "error") {
    return {
      status: "error",
      message: "Unable to send magic link.",
    };
  }

  return { status: "idle" };
}
