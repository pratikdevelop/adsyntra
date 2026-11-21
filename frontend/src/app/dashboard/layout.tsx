import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import DashboardShell from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await auth.protect();

  return <DashboardShell>{children}</DashboardShell>;
}