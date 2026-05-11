import "server-only";

import { cookies } from "next/headers";

import {
  DASHBOARD_DATA_MODE_COOKIE,
  type DashboardDataMode,
} from "./dashboard-data-mode.shared";

export type { DashboardDataMode };

export async function readDashboardDataMode(): Promise<DashboardDataMode> {
  const jar = await cookies();
  const value = jar.get(DASHBOARD_DATA_MODE_COOKIE)?.value;
  return value === "mock" ? "mock" : "live";
}
