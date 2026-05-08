"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAllowedUserByEmail, normalizeEmail } from "./auth.repository";
import { createSupabaseServerClient } from "./supabase/server";

export type LoginFormState = {
  status: "idle" | "success" | "error" | "unauthorized";
  message?: string;
};

export async function sendMagicLinkAction(
  _state: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const emailValue = formData.get("email");

  if (typeof emailValue !== "string" || !emailValue.trim()) {
    return {
      status: "error",
      message: "Unable to send magic link.",
    };
  }

  const email = normalizeEmail(emailValue);
  const allowedUser = await getAllowedUserByEmail(email);

  if (!allowedUser) {
    return {
      status: "unauthorized",
      message: "This email is not authorized to access Recipe2Video.",
    };
  }

  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    process.env.APP_BASE_URL ??
    "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return {
      status: "error",
      message: "Unable to send magic link.",
    };
  }

  return {
    status: "success",
    message: "Check your email. The link expires shortly.",
  };
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  redirect("/login");
}
