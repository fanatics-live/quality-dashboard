"use client";

import type { DashboardData, TrendData, VerticalSummary, RangePreset } from "@/lib/types";
import { qualityGrade } from "@/lib/quality/grading";
import { slug } from "@/lib/utils";
import { Header } from "./header";
import { KpiCard } from "./kpi-card";
import { VerticalCard } from "./vertical-card";
import { BugTypeDonut, EnvironmentChart, SeverityChart, AutomationChart } from "./quality-charts";
import { AutomationTable } from "./automation-table";
import { DeltaBadge } from "./delta-badge";
import { Sparkline } from "./sparkline";
import { TrendChart } from "./trend-chart";
import { RangeSelector } from "./range-selector";
import { Bug, AlertTriangle, Shield, Activity, Zap, Clock, RefreshCw } from "lucide-react";
import { useState } from "react";

export function DashboardContent({
  data,
  trends,
  range,
  onRangeChange,
  onRefresh,
  cachedAt,
}: {
  data: DashboardData;
  trends: TrendData;
  range: RangePreset;
  onRangeChange: (r: RangePreset) => void;
  onRefresh: () => void;
  cachedAt?: string;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const overallGrade = qualityGrade({
    total: data.bugs.total,
    open: data.bugs.open,
    regression: data.bugs.byType.regression,
  });

  const verticals: VerticalSummary[] = Object.entries(data.bugs.byVertical)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([name, stats]) => ({
      name,
      slug: slug(name),
      grade: qualityGrade(stats),
      stats,
      mainTeamKey: stats.subteams["(main)"]?.teamKey ?? Object.values(stats.subteams)[0]?.teamKey ?? "",
    }));

  const handleRefresh = () => {
    setRefreshing(true);
    onRefresh();
  };

  const bugSparkline = trends.timeSeries.map((t) => t.bugs);
  const incidentSparkline = trends.timeSeries.map((t) => t.incidents);
  const regressionSparkline = trends.timeSeries.map((t) => t.regressions);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <Header period={data.period} grade={overallGrade} cachedAt={cachedAt} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <RangeSelector
            value={range}
            onChange={onRangeChange}
            comparison={`${trends.previous.start} — ${trends.previous.end}`}
          />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors print:hidden"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* KPIs with deltas and sparklines */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            value={data.bugs.total}
            label="Total Bugs"
            detail={`${data.bugs.triage} triage · ${data.bugs.open} open · ${data.bugs.closed} closed`}
            accent={data.bugs.open > 20 ? "danger" : data.bugs.open > 10 ? "warning" : "success"}
            icon={<Bug className="w-5 h-5" />}
            delta={<DeltaBadge delta={trends.bugs} />}
            sparkline={<Sparkline data={bugSparkline} color="#6366f1" />}
          />
          <KpiCard
            value={data.bugs.byType.regression}
            label="Regressions"
            detail={`${data.bugs.byType.progression} progressions`}
            accent={data.bugs.byType.regression > 5 ? "danger" : data.bugs.byType.regression > 2 ? "warning" : "success"}
            icon={<AlertTriangle className="w-5 h-5" />}
            delta={<DeltaBadge delta={trends.regressions} />}
            sparkline={<Sparkline data={regressionSparkline} color="#dc2626" />}
          />
          <KpiCard
            value={data.incidents.total}
            label="Incidents"
            detail={`MTTR: ${data.incidents.mttr != null ? data.incidents.mttr + " min" : "N/A"}`}
            accent={data.incidents.total > 5 ? "danger" : data.incidents.total > 2 ? "warning" : "info"}
            icon={<Shield className="w-5 h-5" />}
            delta={<DeltaBadge delta={trends.incidents} />}
            sparkline={<Sparkline data={incidentSparkline} color="#f59e0b" />}
          />
          <KpiCard
            value={`${data.automation.coveragePercent}%`}
            label="Automation"
            detail={`${data.automation.automatedCases} / ${data.automation.totalCases}`}
            accent={data.automation.coveragePercent >= 60 ? "success" : data.automation.coveragePercent >= 30 ? "warning" : "danger"}
            icon={<Zap className="w-5 h-5" />}
          />
          <KpiCard
            value={`${data.automation.averagePassRate}%`}
            label="Pass Rate"
            detail={`${data.automation.totalRuns} runs`}
            accent="info"
            icon={<Activity className="w-5 h-5" />}
            delta={<DeltaBadge delta={trends.passRate} />}
          />
          <KpiCard
            value={data.bugs.mttr != null ? `${data.bugs.mttr}h` : "N/A"}
            label="Bug MTTR"
            detail="Mean time to resolve"
            accent={data.bugs.mttr != null && data.bugs.mttr > 72 ? "danger" : "info"}
            icon={<Clock className="w-5 h-5" />}
            delta={<DeltaBadge delta={trends.mttr} />}
          />
        </div>

        {/* Trend chart */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Bug & Incident Trend
            </h3>
            <div className="flex items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-indigo-500 inline-block" /> Bugs
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-red-500 inline-block border-dashed" style={{ borderTop: "2px dashed #dc2626", height: 0 }} /> Regressions
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-amber-500 inline-block" /> Incidents
              </span>
            </div>
          </div>
          <TrendChart timeSeries={trends.timeSeries} />
        </div>

        {/* Verticals with trend deltas */}
        <section>
          <h2 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold mb-3">
            Quality by Vertical — click for details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {verticals.map((v) => {
              const vt = trends.verticalTrends.find((t) => t.name === v.name);
              return (
                <VerticalCard key={v.slug} vertical={v} trend={vt} />
              );
            })}
          </div>
        </section>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              Bug Classification
            </h3>
            <BugTypeDonut byType={data.bugs.byType} />
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              Bugs by Environment
            </h3>
            <EnvironmentChart byEnvironment={data.bugs.byEnvironment} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              Bugs by Severity
            </h3>
            <SeverityChart bySeverity={data.bugs.bySeverity} />
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
              Incidents by Severity
            </h3>
            {data.incidents.total > 0
              ? <SeverityChart bySeverity={data.incidents.bySeverity} />
              : <p className="text-sm text-slate-400 italic">No incident data</p>
            }
          </div>
        </div>

        {/* Automation */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
            Test Automation (QASE.io)
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AutomationTable projects={data.automation.projects} />
            <AutomationChart projects={data.automation.projects} />
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-400 dark:text-slate-500 py-4 print:text-slate-600">
          Generated on {new Date(data.generatedAt).toLocaleDateString("en-US", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
          })} · {trends.current.start} → {trends.current.end} vs {trends.previous.start} → {trends.previous.end} · Powered by LLM Council
        </footer>
      </main>
    </div>
  );
}
