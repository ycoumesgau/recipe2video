"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  DASHBOARD_DATA_MODE_COOKIE,
  type DashboardDataMode,
} from "./dashboard-data-mode.shared";

export async function setDashboardDataMode(mode: DashboardDataMode) {
  const jar = await cookies();
  jar.set(DASHBOARD_DATA_MODE_COOKIE, mode, {
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
