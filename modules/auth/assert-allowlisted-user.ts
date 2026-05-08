import "server-only";

import type { AllowedUser, AuthUser, Profile } from "./auth.types";
import {
  ensureProfileForUser,
  getAllowedUserByEmail,
  getAuthUserById,
} from "./auth.repository";
import { createSupabaseServerClient } from "./supabase/server";

type AuthAccessCode = "unauthenticated" | "unauthorized";

export class AuthAccessError extends Error {
  constructor(
    public readonly code: AuthAccessCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthAccessError";
  }
}

export function isAuthAccessError(error: unknown): error is AuthAccessError {
  return error instanceof AuthAccessError;
}

export async function assertAuthenticatedUser(): Promise<AuthUser> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    throw new AuthAccessError(
      "unauthenticated",
      "Authentication is required.",
    );
  }

  return {
    id: user.id,
    email: user.email.trim().toLowerCase(),
  };
}

export async function assertAllowlistedUser(
  userId: string,
): Promise<AllowedUser> {
  const user = await getAuthUserById(userId);

  if (!user) {
    throw new AuthAccessError(
      "unauthenticated",
      "Authentication is required.",
    );
  }

  const allowedUser = await getAllowedUserByEmail(user.email);

  if (!allowedUser) {
    throw new AuthAccessError(
      "unauthorized",
      "This email is not authorized to access Recipe2Video.",
    );
  }

  return allowedUser;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  try {
    const user = await assertAuthenticatedUser();
    const allowedUser = await assertAllowlistedUser(user.id);

    return ensureProfileForUser(user, allowedUser.role);
  } catch (error) {
    if (
      isAuthAccessError(error) &&
      error.code === "unauthenticated"
    ) {
      return null;
    }

    throw error;
  }
}

export async function assertCostlyActionAllowed() {
  const user = await assertAuthenticatedUser();
  const allowedUser = await assertAllowlistedUser(user.id);
  const profile = await ensureProfileForUser(user, allowedUser.role);

  return { user, allowedUser, profile };
}

export async function signOutCurrentUser() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}
