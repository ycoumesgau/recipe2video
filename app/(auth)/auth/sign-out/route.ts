import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/modules/auth/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const status = requestUrl.searchParams.get("status");
  const supabase = await createSupabaseServerClient();

  await supabase.auth.signOut();

  const loginUrl = new URL("/login", requestUrl.origin);

  if (status === "unauthorized") {
    loginUrl.searchParams.set("status", "unauthorized");
  }

  return NextResponse.redirect(loginUrl);
}
