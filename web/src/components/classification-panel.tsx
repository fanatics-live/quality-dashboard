"use client";

import { useMemo, useState } from "react";
import { Info, Table2, ChartColumnBig } from "lucide-react";
import type { LinearBug, Delta } from "@/lib/types";
import { BugMatrix } from "./bug-matrix";
import { BugTypeDonut, EnvironmentChart, SeverityChart } from "./quality-charts";
import { cn } from "@/lib/utils";

type View = "table" | "charts";

interface TypeTrends {
  regression: Delta;
  progression: Delta;
  unknown: Delta;
}

export function ClassificationPanel({
  bugs,
  trends,
  showEnvironment = true,
}: {
  bugs: LinearBug[];
  trends?: TypeTrends;
  showEnvironment?: boolean;
}) {
  const [view, setView] = useState<View>("table");

  const charts = useMemo(() => {
    const bugsByType = {
      regression: bugs.filter((b) => b.type === "regression"),
      progression: bugs.filter((b) => b.type === "progression"),
      legacy: bugs.filter((b) => b.type === "legacy"),
      thirdParty: bugs.filter((b) => b.type === "thirdParty"),
      unknown: bugs.filter((b) => b.type === "unknown"),
    };
    const byType = {
      regression: bugsByType.regression.length,
      progression: bugsByType.progression.length,
      legacy: bugsByType.legacy.length,
      thirdParty: bugsByType.thirdParty.length,
      unknown: bugsByType.unknown.length,
    };
    const byEnv: Record<string, number> = {};
    const bySev: Record<string, number> = {};
    const bugsByEnv: Record<string, LinearBug[]> = {};
    const bugsBySev: Record<string, LinearBug[]> = {};
    for (const b of bugs) {
      byEnv[b.environment] = (byEnv[b.environment] ?? 0) + 1;
      bySev[b.severity] = (bySev[b.severity] ?? 0) + 1;
      (bugsByEnv[b.environment] ??= []).push(b);
      (bugsBySev[b.severity] ??= []).push(b);
    }
    return { byType, bugsByType, byEnv, bugsByEnv, bySev, bugsBySev };
  }, [bugs]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          Environment × Bug Type × Severity
          <span className="relative group">
            <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] leading-relaxed shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
              One block per environment, with bug type in rows and severity in columns.<br />
              The <strong>Production</strong> block is highlighted — those are your escapes. Click any figure for the ticket list.
              <span className="block mt-1.5 pt-1.5 border-t border-slate-700 text-slate-300">Open tickets only — excludes closed, released, cancelled/duplicate/invalid.</span>
              <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
            </span>
          </span>
        </h3>
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5 print:hidden">
          {([
            { value: "table" as const, label: "Table", Icon: Table2 },
            { value: "charts" as const, label: "Charts", Icon: ChartColumnBig },
          ]).map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                view === value
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "table" ? (
        <BugMatrix bugs={bugs} />
      ) : (
        <div className={cn("grid grid-cols-1 gap-6", showEnvironment ? "md:grid-cols-3" : "md:grid-cols-2")}>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Bug Type</h4>
            <BugTypeDonut byType={charts.byType} bugsByType={charts.bugsByType} trends={trends} />
          </div>
          {showEnvironment && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Environment</h4>
              <EnvironmentChart byEnvironment={charts.byEnv} bugsByGroup={charts.bugsByEnv} />
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Severity</h4>
            <SeverityChart bySeverity={charts.bySev} bugsByGroup={charts.bugsBySev} />
          </div>
        </div>
      )}
    </div>
  );
}
