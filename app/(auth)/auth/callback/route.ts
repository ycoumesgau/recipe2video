import { NextResponse, type NextRequest } from "next/server";

import {
  ensureProfileForUser,
  getAllowedUserByEmail,
  normalizeEmail,
} from "@/modules/auth/auth.repository";
import { createSupabaseServerClient } from "@/modules/auth/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (!code) {
    return redirectToLogin(requestUrl, "error");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToLogin(requestUrl, "error");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ? normalizeEmail(user.email) : null;

  if (!user || !email) {
    await supabase.auth.signOut();
    return redirectToLogin(requestUrl, "error");
  }

  const allowedUser = await getAllowedUserByEmail(email);

  if (!allowedUser) {
    await supabase.auth.signOut();
    return redirectToLogin(requestUrl, "unauthorized");
  }

  await ensureProfileForUser(
    {
      id: user.id,
      email,
    },
    allowedUser.role,
  );

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

function redirectToLogin(requestUrl: URL, status: "error" | "unauthorized") {
  return NextResponse.redirect(
    new URL(`/login?status=${status}`, requestUrl.origin),
  );
}
