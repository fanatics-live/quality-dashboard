"use client";

import type { DashboardData, TrendData, ExecSummary, RangePreset, SourceError } from "@/lib/types";
import { isClassificationBug } from "@/lib/integrations/linear";
import { Header } from "./header";
import { KpiCard } from "./kpi-card";
import { BugTypeDonut, EnvironmentChart, SeverityChart, AutomationChart } from "./quality-charts";
import { AutomationTable } from "./automation-table";
import { DeltaBadge } from "./delta-badge";
import { Sparkline } from "./sparkline";
import { BugBurnChart, IncidentTrendChart } from "./trend-chart";
import { RangeSelector } from "./range-selector";
import { ExecQuadrants } from "./exec-quadrants";
import { TeamRanking } from "./team-ranking";
import { Kr1ProdDefectsSection } from "./kr1-prod-defects";
import { linearOrgBugsUrl, linearLabelUrl } from "@/lib/quality/links";
import { THRESHOLDS } from "@/lib/quality/thresholds";
import { Bug, AlertTriangle, Shield, Zap, Activity, Clock, RefreshCw, Info } from "lucide-react";
import { useState, useMemo } from "react";

export function DashboardContent({
  data,
  trends,
  exec,
  range,
  onRangeChange,
  onRefresh,
  cachedAt,
  sourceErrors,
}: {
  data: DashboardData;
  trends: TrendData;
  exec: ExecSummary;
  range: RangePreset;
  onRangeChange: (r: RangePreset) => void;
  onRefresh: () => void;
  cachedAt?: string;
  sourceErrors?: SourceError[];
}) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    onRefresh();
  };

  const bugSparkline = trends.timeSeries.map((t) => t.bugs);
  const incidentSparkline = trends.timeSeries.map((t) => t.incidents);
  const regressionSparkline = trends.timeSeries.map((t) => t.regressions);

  const { classificationByType, classificationBugsByType, classificationByEnv, classificationBugsByEnv, classificationBySev, classificationBugsBySev } = useMemo(() => {
    const classificationBugs = data.bugs.bugs.filter(isClassificationBug);
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
    const byEnv: Record<string, number> = {};
    const bySev: Record<string, number> = {};
    const bugsByEnv: Record<string, typeof classificationBugs> = {};
    const bugsBySev: Record<string, typeof classificationBugs> = {};
    for (const b of classificationBugs) {
      byEnv[b.environment] = (byEnv[b.environment] ?? 0) + 1;
      bySev[b.severity] = (bySev[b.severity] ?? 0) + 1;
      (bugsByEnv[b.environment] ??= []).push(b);
      (bugsBySev[b.severity] ??= []).push(b);
    }
    return {
      classificationByType: byType,
      classificationBugsByType: bugsByType,
      classificationByEnv: byEnv,
      classificationBugsByEnv: bugsByEnv,
      classificationBySev: bySev,
      classificationBugsBySev: bugsBySev,
    };
  }, [data.bugs.bugs]);

  const { start: periodStart, end: periodEnd } = trends.current;
  const cycleProgress = useMemo(() => {
    if (range !== "cycle") return null;
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    const dayOf = Math.min(totalDays, Math.max(1, Math.floor((Date.now() - start.getTime()) / 86_400_000) + 1));
    return { dayOf, totalDays };
  }, [range, periodStart, periodEnd]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <Header period={data.period} grade={exec.healthScore.grade} cachedAt={cachedAt} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Source failure warning */}
        {sourceErrors && sourceErrors.length > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Some data sources failed — figures below may be incomplete.</p>
              {sourceErrors.map((e) => (
                <p key={e.source} className="mt-0.5">
                  <span className="font-medium capitalize">{e.source}</span>: {e.message}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <RangeSelector
              value={range}
              onChange={onRangeChange}
              comparison={`${trends.previous.start} — ${trends.previous.end}`}
            />
            {cycleProgress && (
              <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full print:hidden">
                Cycle {trends.current.start} → {trends.current.end} · day {cycleProgress.dayOf}/{cycleProgress.totalDays}
              </span>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors print:hidden"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* ── Executive Summary (30-second view) ── */}
        <ExecQuadrants exec={exec} trends={{ bugs: trends.openBugs, incidents: trends.incidents }} incidents={data.incidents.incidents} />

        {/* ── KPI Strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            value={data.bugs.total}
            label="Total Bugs"
            detail={`${data.bugs.triage} triage · ${data.bugs.open} open · ${data.bugs.closed} closed`}
            accent={data.bugs.open > THRESHOLDS.totalOpenBugs.danger ? "danger" : data.bugs.open > THRESHOLDS.totalOpenBugs.warning ? "warning" : "success"}
            icon={<Bug className="w-5 h-5" />}
            delta={<DeltaBadge delta={trends.bugs} />}
            sparkline={<Sparkline data={bugSparkline} color="#6366f1" />}
            href={linearOrgBugsUrl()}
          />
          <KpiCard
            value={data.bugs.byType.regression}
            label="Regressions"
            detail={`${exec.regressionRate}% of total`}
            accent={data.bugs.byType.regression > THRESHOLDS.regressionCount.danger ? "danger" : data.bugs.byType.regression > THRESHOLDS.regressionCount.warning ? "warning" : "success"}
            icon={<AlertTriangle className="w-5 h-5" />}
            delta={<DeltaBadge delta={trends.regressions} />}
            sparkline={<Sparkline data={regressionSparkline} color="#dc2626" />}
            href={linearLabelUrl("Regression bug")}
          />
          <KpiCard
            value={data.incidents.total}
            label="Incidents"
            detail={`MTTR: ${data.incidents.mttr != null ? data.incidents.mttr + " min" : "N/A"}`}
            accent={data.incidents.total > THRESHOLDS.incidentCount.danger ? "danger" : data.incidents.total > THRESHOLDS.incidentCount.warning ? "warning" : "info"}
            icon={<Shield className="w-5 h-5" />}
            delta={<DeltaBadge delta={trends.incidents} />}
            sparkline={<Sparkline data={incidentSparkline} color="#f59e0b" />}
            href="https://app.incident.io/fanatics-live/incidents"
          />
          <KpiCard
            value={`${exec.escapedDefectRate}%`}
            label="Escaped Defects"
            detail={`${exec.productionBugs} production bugs`}
            accent={exec.escapedDefectRate > THRESHOLDS.escapedDefectRate.bad ? "danger" : exec.escapedDefectRate > THRESHOLDS.escapedDefectRate.watch ? "warning" : "success"}
            icon={<Zap className="w-5 h-5" />}
            href={linearOrgBugsUrl()}
          />
          <KpiCard
            value={`${data.automation.averagePassRate}%`}
            label="Pass Rate"
            detail={`${data.automation.totalRuns} runs · ${data.automation.coveragePercent}% coverage`}
            accent={data.automation.averagePassRate >= THRESHOLDS.passRate.good ? "success" : data.automation.averagePassRate >= THRESHOLDS.passRate.watch ? "warning" : "danger"}
            icon={<Activity className="w-5 h-5" />}
            delta={<DeltaBadge delta={trends.passRate} />}
            href="https://app.qase.io"
          />
          <KpiCard
            value={data.bugs.mttr != null ? `${data.bugs.mttr}h` : "N/A"}
            label="Bug MTTR"
            detail="Mean time to resolve"
            accent={data.bugs.mttr != null && data.bugs.mttr > THRESHOLDS.bugMttrHours.danger ? "danger" : "info"}
            icon={<Clock className="w-5 h-5" />}
            delta={<DeltaBadge delta={trends.mttr} />}
            href={linearOrgBugsUrl()}
          />
        </div>

        {/* ── Trend Charts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Bug Burn Chart
              </h3>
              <div className="flex items-center gap-4 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-indigo-500 inline-block" /> Total
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-red-500 inline-block" style={{ borderTop: "2px dashed #dc2626", height: 0 }} /> Regressions
                </span>
              </div>
            </div>
            <BugBurnChart timeSeries={trends.timeSeries} />
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Incidents
              </h3>
              <span className="text-[11px] text-slate-400">Daily by severity</span>
            </div>
            <IncidentTrendChart timeSeries={trends.timeSeries} incidents={data.incidents.incidents} />
          </div>
        </div>

        {/* ── Team Health Ranking ── */}
        <TeamRanking teams={exec.teamRisks} />

        {/* ── Detailed Charts ── */}
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
              byType={classificationByType}
              bugsByType={classificationBugsByType}
              trends={{ regression: trends.classification.regressions, progression: trends.classification.progressions, unknown: trends.classification.unknown }}
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
            <EnvironmentChart byEnvironment={classificationByEnv} bugsByGroup={classificationBugsByEnv} />
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
            <SeverityChart bySeverity={classificationBySev} bugsByGroup={classificationBugsBySev} />
          </div>
        </div>

        {/* ── Automation ── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
            Test Automation (QASE.io)
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AutomationTable projects={data.automation.projects} />
            <AutomationChart projects={data.automation.projects} />
          </div>
        </div>

        {/* ── KR1: Prod functional defect reduction (Q2 vs Q1) ── */}
        <Kr1ProdDefectsSection kr1={exec.kr1ProdDefects} kr2={exec.kr2ReleaseBlockers} />

        {/* Footer */}
        <footer className="text-center text-xs text-slate-400 dark:text-slate-500 py-4 print:text-slate-600">
          Generated on {new Date(data.generatedAt).toLocaleDateString("en-US", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          })} · {trends.current.start} → {trends.current.end} vs {trends.previous.start} → {trends.previous.end}
        </footer>
      </main>
    </div>
  );
}
