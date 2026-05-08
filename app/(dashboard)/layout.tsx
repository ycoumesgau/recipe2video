import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import {
  getCurrentProfile,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentProfile().catch(async (error) => {
    if (isAuthAccessError(error) && error.code === "unauthorized") {
      redirect("/auth/sign-out?status=unauthorized");
    }

    throw error;
  });

  if (!profile) {
    redirect("/login");
  }

  return <AppShell userEmail={profile.email}>{children}</AppShell>;
}
