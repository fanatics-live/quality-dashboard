import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getEnv } from "@/lib/env";
import { collectDashboardData } from "@/lib/quality/collector";
import { qualityGrade } from "@/lib/quality/grading";
import { slug as toSlug } from "@/lib/utils";
import { GradeBadge } from "@/components/grade-badge";
import { KpiCard } from "@/components/kpi-card";
import { SubteamTable } from "@/components/subteam-table";
import { BugList } from "@/components/bug-list";
import { EnvironmentChart, SeverityChart } from "@/components/quality-charts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VerticalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const env = getEnv();
  const data = await collectDashboardData(env);

  const entry = Object.entries(data.bugs.byVertical).find(([name]) => toSlug(name) === slug);
  if (!entry) notFound();

  const [name, vs] = entry;
  const grade = qualityGrade(vs);
  const bugs = data.bugs.bugs.filter((b) => b.vertical === name);

  const envCounts: Record<string, number> = {};
  const sevCounts: Record<string, number> = {};
  for (const b of bugs) {
    envCounts[b.environment] = (envCounts[b.environment] ?? 0) + 1;
    sevCounts[b.severity] = (sevCounts[b.severity] ?? 0) + 1;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors print:hidden"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Overview
        </Link>

        {/* Header */}
        <div className="flex items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold">{name}</h1>
          <GradeBadge grade={grade} size="lg" />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            value={vs.total}
            label="Total Bugs"
            detail={`${vs.triage} triage · ${vs.open} open`}
          />
          <KpiCard
            value={vs.regression}
            label="Regressions"
            accent="danger"
          />
          <KpiCard
            value={vs.progression}
            label="Progressions"
            accent="info"
          />
          <KpiCard
            value={Object.keys(vs.subteams).length}
            label="Sub-teams"
          />
        </div>

        {/* Subteam table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
            Bug Breakdown by Sub-team
          </h3>
          <SubteamTable subteams={vs.subteams} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              By Environment
            </h3>
            <EnvironmentChart byEnvironment={envCounts} />
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              By Severity
            </h3>
            <SeverityChart bySeverity={sevCounts} />
          </div>
        </div>

        {/* Bug list */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
            Recent Bugs
          </h3>
          <BugList bugs={bugs} />
        </div>
      </div>
    </div>
  );
}
