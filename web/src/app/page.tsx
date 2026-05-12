import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

export default function HomePage() {
  return (
    <Suspense>
      <DashboardShell />
    </Suspense>
  );
}
