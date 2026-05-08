import "server-only";

import type { User } from "@supabase/supabase-js";

import type { AllowedUser, AuthRole, AuthUser, Profile } from "./auth.types";
import { createSupabaseAdminClient } from "./supabase/admin";

type AllowedUserRow = {
  id: string;
  email: string;
  role: AuthRole;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string;
  role: AuthRole;
  created_at: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getAllowedUserByEmail(
  email: string,
): Promise<AllowedUser | null> {
  const supabase = createSupabaseAdminClient();
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await supabase
    .from("allowed_users")
    .select("id,email,role,created_at")
    .eq("email", normalizedEmail)
    .maybeSingle<AllowedUserRow>();

  if (error) {
    throw error;
  }

  return data ? mapAllowedUser(data) : null;
}

export async function getAuthUserById(userId: string): Promise<AuthUser | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error) {
    throw error;
  }

  return data.user ? mapAuthUser(data.user) : null;
}

export async function ensureProfileForUser(
  user: AuthUser,
  role: AuthRole,
): Promise<Profile> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: normalizeEmail(user.email),
        role,
      },
      { onConflict: "id" },
    )
    .select("id,email,role,created_at")
    .single<ProfileRow>();

  if (error) {
    throw error;
  }

  return mapProfile(data);
}

function mapAuthUser(user: User): AuthUser | null {
  if (!user.email) {
    return null;
  }

  return {
    id: user.id,
    email: normalizeEmail(user.email),
  };
}

function mapAllowedUser(row: AllowedUserRow): AllowedUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}
