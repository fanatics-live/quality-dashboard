import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { getEnv } from "@/lib/env";
import { collectWithTrends } from "@/lib/quality/collector";
import { isClassificationBug } from "@/lib/integrations/linear";
import { qualityGrade } from "@/lib/quality/grading";
import { slug as toSlug } from "@/lib/utils";
import type { RangePreset } from "@/lib/types";
import { GradeBadge } from "@/components/grade-badge";
import { KpiCard } from "@/components/kpi-card";
import { DeltaBadge } from "@/components/delta-badge";
import { SubteamTable } from "@/components/subteam-table";
import { BugList } from "@/components/bug-list";
import { BugTypeDonut, EnvironmentChart, SeverityChart } from "@/components/quality-charts";
import { RangeNav } from "@/components/range-nav";
import { RefreshButton } from "@/components/refresh-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID_RANGES = new Set<RangePreset>(["7d", "14d", "30d", "quarter", "cycle"]);

export default async function VerticalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { slug } = await params;
  const { range: rangeParam } = await searchParams;
  const range: RangePreset = rangeParam && VALID_RANGES.has(rangeParam as RangePreset) ? (rangeParam as RangePreset) : "7d";
  const env = getEnv();
  const { data, trends } = await collectWithTrends(env, range);

  const entry = Object.entries(data.bugs.byVertical).find(([name]) => toSlug(name) === slug);
  if (!entry) notFound();

  const [name, vs] = entry;
  const grade = qualityGrade(vs);
  const bugs = data.bugs.bugs.filter((b) => b.vertical === name);
  const verticalTrend = trends.verticalTrends.find((t) => t.name === name);

  const classificationBugs = bugs.filter(isClassificationBug);
  const recentBugs = [...classificationBugs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const bugsByType = {
    regression: classificationBugs.filter((b) => b.type === "regression"),
    progression: classificationBugs.filter((b) => b.type === "progression"),
    unknown: classificationBugs.filter((b) => b.type === "unknown"),
  };
  const byType = {
    regression: bugsByType.regression.length,
    progression: bugsByType.progression.length,
    unknown: bugsByType.unknown.length,
  };
  const envCounts: Record<string, number> = {};
  const sevCounts: Record<string, number> = {};
  const bugsByEnv: Record<string, typeof classificationBugs> = {};
  const bugsBySev: Record<string, typeof classificationBugs> = {};
  for (const b of classificationBugs) {
    envCounts[b.environment] = (envCounts[b.environment] ?? 0) + 1;
    sevCounts[b.severity] = (sevCounts[b.severity] ?? 0) + 1;
    (bugsByEnv[b.environment] ??= []).push(b);
    (bugsBySev[b.severity] ??= []).push(b);
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
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">{name}</h1>
            <span className="relative group cursor-help">
              <GradeBadge grade={grade} size="lg" />
              <span className="absolute left-0 top-full mt-2 w-80 px-3 py-2.5 rounded-lg bg-slate-900 text-white text-[11px] leading-relaxed shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                <strong>Grade qualité</strong> — score sur 100, calculé sur les bugs valides de la période.<br />
                Départ à <strong>100</strong>, puis pénalités :<br />
                • % de bugs <strong>ouverts</strong> × 40<br />
                • % de <strong>régressions</strong> × 30<br />
                • <strong>volume</strong> de bugs : min(total ÷ 20, 1) × 30 — plafonné à 20 bugs
                <span className="block mt-1.5 pt-1.5 border-t border-slate-700 text-slate-300">
                  A ≥ 80 · B ≥ 60 · C ≥ 40 · D ≥ 20 · E &lt; 20 — aucun bug = A
                </span>
                <span className="absolute left-3 bottom-full w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-slate-900" />
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
              {trends.current.start} → {trends.current.end}
            </span>
            <RangeNav value={range} comparison={`${trends.previous.start} — ${trends.previous.end}`} />
            <RefreshButton />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          <KpiCard
            value={verticalTrend?.incidents.current ?? 0}
            label="Incidents"
            accent="warning"
            delta={verticalTrend && <DeltaBadge delta={verticalTrend.incidents} compact />}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
              Bug Classification
              <span className="relative group">
                <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] leading-relaxed shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                  Group label: <strong>Bug type</strong><br />
                  <strong>Regression</strong> — &ldquo;Regression bug&rdquo;<br />
                  <strong>Progression</strong> — &ldquo;Progression bug&rdquo;<br />
                  <strong>Unclassified</strong> — no Bug type label
                  <span className="block mt-1.5 pt-1.5 border-t border-slate-700 text-slate-300">Open tickets only — excludes closed, released, cancelled/duplicate/invalid</span>
                  <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
                </span>
              </span>
            </h3>
            <BugTypeDonut
              byType={byType}
              bugsByType={bugsByType}
              trends={verticalTrend ? {
                regression: verticalTrend.classification.regressions,
                progression: verticalTrend.classification.progressions,
                unknown: verticalTrend.classification.unknown,
              } : undefined}
            />
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
              Bugs by Environment
              <span className="relative group">
                <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] leading-relaxed shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                  Group label: <strong>Bug environment</strong><br />
                  Production, Staging, Dev, Dogfood<br />
                  <strong>Unclassified</strong> — no environment label
                  <span className="block mt-1.5 pt-1.5 border-t border-slate-700 text-slate-300">Open tickets only — excludes closed, released, cancelled/duplicate/invalid</span>
                  <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
                </span>
              </span>
            </h3>
            <EnvironmentChart byEnvironment={envCounts} bugsByGroup={bugsByEnv} />
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
              Bugs by Severity
              <span className="relative group">
                <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] leading-relaxed shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                  Group label: <strong>Severity</strong><br />
                  Critical, High, Medium, Low<br />
                  <strong>Unclassified</strong> — no severity label
                  <span className="block mt-1.5 pt-1.5 border-t border-slate-700 text-slate-300">Open tickets only — excludes closed, released, cancelled/duplicate/invalid</span>
                  <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
                </span>
              </span>
            </h3>
            <SeverityChart bySeverity={sevCounts} bugsByGroup={bugsBySev} />
          </div>
        </div>

        {/* Bug list */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
            Recent Bugs
            <span className="relative group">
              <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
              <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] leading-relaxed shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                Open tickets only — <strong>Triage</strong>, <strong>QA Verified</strong> and in-progress bugs.<br />
                Excludes <strong>Done</strong> / <strong>Released</strong> / <strong>Release Ready</strong> (already shipped) and cancelled / duplicate / invalid (noise).
                <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
              </span>
            </span>
          </h3>
          <BugList bugs={recentBugs} />
        </div>
      </div>
    </div>
  );
}
