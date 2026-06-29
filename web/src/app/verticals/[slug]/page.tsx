import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { getEnv } from "@/lib/env";
import { collectWithTrends, getLinearProjects } from "@/lib/quality/collector";
import { isClassificationBug } from "@/lib/integrations/linear";
import { qualityGrade } from "@/lib/quality/grading";
import { slug as toSlug, severityRank, priorityRank } from "@/lib/utils";
import type { RangePreset, EnvFilter, LinearBug, VerticalStats } from "@/lib/types";
import { GradeBadge } from "@/components/grade-badge";
import { KpiCard } from "@/components/kpi-card";
import { DeltaBadge } from "@/components/delta-badge";
import { SubteamTable } from "@/components/subteam-table";
import { ProjectTable } from "@/components/project-table";
import { ProdEscapedCard } from "@/components/prod-escaped-card";
import { IncidentCard } from "@/components/incident-card";
import { ClassificationPanel } from "@/components/classification-panel";
import { BugList } from "@/components/bug-list";
import { RangeNav } from "@/components/range-nav";
import { EnvNav } from "@/components/env-nav";
import { RefreshButton } from "@/components/refresh-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_RANGES = new Set<RangePreset>(["14d", "30d", "quarter", "cycle"]);
const VALID_ENVS = new Set<EnvFilter>(["all", "Production", "Staging", "Development", "Dogfood"]);

export default async function VerticalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; env?: string }>;
}) {
  const { slug } = await params;
  const { range: rangeParam, env: envParam } = await searchParams;
  const range: RangePreset = rangeParam && VALID_RANGES.has(rangeParam as RangePreset) ? (rangeParam as RangePreset) : "quarter";
  const envFilter: EnvFilter = envParam && VALID_ENVS.has(envParam as EnvFilter) ? (envParam as EnvFilter) : "Production";
  const env = getEnv();
  const scoped = await collectWithTrends(env, range, envFilter);
  // Unscoped view (env="all") — used to resolve the vertical name, to know which
  // environments have data, and to feed the prod-only cards (Escaped to Prod,
  // Incidents) which must never depend on the env filter.
  const all = envFilter === "all" ? scoped : await collectWithTrends(env, range, "all");
  const { data, trends } = scoped;
  const allData = all.data;

  // Resolve the canonical vertical name from the unscoped set so an env filter
  // with zero bugs in the window renders an empty state instead of 404-ing.
  const allEntry = Object.entries(allData.bugs.byVertical).find(([n]) => toSlug(n) === slug);
  if (!allEntry) notFound();
  const name = allEntry[0];

  const vs: VerticalStats =
    data.bugs.byVertical[name] ?? { total: 0, triage: 0, open: 0, regression: 0, progression: 0, subteams: {} };
  // Unscoped stats for the quality grade — the grade must reflect the whole
  // vertical, not the selected environment (still varies with the period).
  const allVs: VerticalStats =
    allData.bugs.byVertical[name] ?? { total: 0, triage: 0, open: 0, regression: 0, progression: 0, subteams: {} };

  // Environments with at least one bug for this vertical in the window — used to
  // trim the env selector so empty environments aren't offered.
  const ENV_OPTIONS: EnvFilter[] = ["Production", "Staging", "Development", "Dogfood"];
  const verticalBugsAll = allData.bugs.bugs.filter((b) => b.vertical === name);
  const availableEnvs = ENV_OPTIONS.filter((e) => verticalBugsAll.some((b) => b.environment === e));

  const grade = qualityGrade(allVs);
  const bugs = data.bugs.bugs.filter((b) => b.vertical === name);
  const verticalTrend = trends.verticalTrends.find((t) => t.name === name);
  // Prod-only cards read from the unscoped trend so the env filter never moves them.
  const allVerticalTrend = all.trends.verticalTrends.find((t) => t.name === name);

  const classificationBugs = bugs.filter(isClassificationBug);
  // Escaped to Prod is production by definition — derive from the unscoped set
  // so it stays constant across env selections (still varies with the period).
  const prodEscapedBugs = verticalBugsAll
    .filter(isClassificationBug)
    .filter((b) => b.environment === "Production");

  // Sub-team → bugs, mirroring the grouping used for TeamStats counts.
  // `bugs` is already isValidBug-filtered (data.bugs.bugs), so totals match.
  const bugsBySubteam: Record<string, LinearBug[]> = {};
  for (const b of bugs) {
    (bugsBySubteam[b.subteam || "(main)"] ??= []).push(b);
  }

  // Recent Bugs focuses on what needs immediate attention: keep only
  // Critical/High severity OR Urgent/High priority, then rank by both.
  const recentBugs = classificationBugs
    .filter(
      (b) =>
        b.severity === "Critical" ||
        b.severity === "High" ||
        b.priority === 1 ||
        b.priority === 2,
    )
    .sort((a, b) => {
      const sev = severityRank(a.severity) - severityRank(b.severity);
      if (sev !== 0) return sev;
      const pri = priorityRank(a.priority) - priorityRank(b.priority);
      if (pri !== 0) return pri;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // In-progress Linear projects for this vertical, soonest target date first.
  const allProjects = await getLinearProjects(env.linearApiKey);
  const activeProjects = allProjects
    .filter((p) => p.state === "started" && p.verticals.includes(name))
    .sort((a, b) => {
      const at = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
      const bt = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
      return at - bt;
    });

  // Bugs attached to each project (all teams, current window) for per-env counts.
  // Open tickets only — exclude completed/released and noise, matching the matrix.
  const bugsByProject: Record<string, LinearBug[]> = {};
  for (const b of data.bugs.bugs) {
    if (b.projectId && isClassificationBug(b)) (bugsByProject[b.projectId] ??= []).push(b);
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
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">{name}</h1>
            <span className="relative group cursor-help">
              <GradeBadge grade={grade} size="lg" />
              <span className="absolute left-0 top-full mt-2 w-80 px-3 py-2.5 rounded-lg bg-slate-900 text-white text-[11px] leading-relaxed shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                <strong>Quality grade</strong> — score out of 100, computed on the period&rsquo;s valid bugs.<br />
                Starts at <strong>100</strong>, then penalties:<br />
                • % of <strong>open</strong> bugs × 40<br />
                • % of <strong>regressions</strong> × 30<br />
                • bug <strong>volume</strong>: min(total ÷ 20, 1) × 30 — capped at 20 bugs
                <span className="block mt-1.5 pt-1.5 border-t border-slate-700 text-slate-300">
                  A ≥ 80 · B ≥ 60 · C ≥ 40 · D ≥ 20 · E &lt; 20 — no bugs = A
                </span>
                <span className="absolute left-3 bottom-full w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-slate-900" />
              </span>
            </span>
          </div>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex flex-col items-start gap-1">
              <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                {trends.current.start} → {trends.current.end}
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                vs {trends.previous.start} — {trends.previous.end}
              </span>
            </div>
            <RangeNav value={range} />
            <EnvNav value={envFilter} available={availableEnvs} />
            <RefreshButton />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            value={vs.total}
            label="Total Bugs"
            detail={`${vs.triage} triage · ${vs.open} open`}
            delta={verticalTrend && <DeltaBadge delta={verticalTrend.bugs} compact />}
          />
          <KpiCard
            value={vs.regression}
            label="Regressions"
            accent="danger"
            delta={verticalTrend && <DeltaBadge delta={verticalTrend.regressions} compact />}
          />
          <KpiCard
            value={vs.progression}
            label="Progressions"
            accent="info"
            delta={verticalTrend && <DeltaBadge delta={verticalTrend.progressions} compact />}
          />
          <ProdEscapedCard bugs={prodEscapedBugs} delta={allVerticalTrend?.prodEscaped} />
          <IncidentCard incidents={allVerticalTrend?.incidentRecords ?? []} delta={allVerticalTrend?.incidents} />
        </div>

        {/* Subteam table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
            Bug Breakdown by Sub-team
          </h3>
          <SubteamTable subteams={vs.subteams} bugsBySubteam={bugsBySubteam} />
        </div>

        {/* Environment × Bug Type × Severity */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
          <ClassificationPanel
            bugs={classificationBugs}
            showEnvironment={envFilter === "all"}
            trends={
              verticalTrend
                ? {
                    regression: verticalTrend.classification.regressions,
                    progression: verticalTrend.classification.progressions,
                    unknown: verticalTrend.classification.unknown,
                  }
                : undefined
            }
          />
        </div>

        {/* Bug list */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
            Recent Bugs
            <span className="relative group">
              <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] leading-relaxed shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                Open tickets only — <strong>Triage</strong> and in-progress bugs.<br />
                A bug counts as <strong>resolved</strong> once it reaches <strong>QA Verified</strong> (the MTTR endpoint), regardless of whether that state is &ldquo;Started&rdquo; or &ldquo;Completed&rdquo;. Teams without a QA Verified state fall back to <strong>Done</strong>.<br />
                Excludes <strong>Done</strong> / <strong>Released</strong> / <strong>Release Ready</strong> (already shipped) and cancelled / duplicate / invalid (noise).
                <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
              </span>
            </span>
          </h3>
          <BugList bugs={recentBugs} />
        </div>

        {/* Linear projects in progress */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            Linear Projects In Progress
            <span className="text-[11px] font-normal text-slate-400">{activeProjects.length}</span>
          </h3>
          <ProjectTable projects={activeProjects} bugsByProject={bugsByProject} />
        </div>
      </div>
    </div>
  );
}
