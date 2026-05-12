"use client";

import Link from "next/link";
import type { VerticalSummary, VerticalTrend } from "@/lib/types";
import { GradeBadge } from "./grade-badge";
import { DeltaBadge } from "./delta-badge";
import { cn } from "@/lib/utils";

export function VerticalCard({ vertical, trend }: { vertical: VerticalSummary; trend?: VerticalTrend }) {
  const { name, slug, grade, stats } = vertical;
  const openColor =
    stats.open > 5 ? "text-red-600" : stats.open > 2 ? "text-amber-500" : "text-emerald-600";

  return (
    <Link href={`/verticals/${slug}`}>
      <div className="group bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border-l-4 border-l-indigo-500 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
            {name}
            {vertical.mainTeamKey && (
              <span className="font-normal text-slate-400 dark:text-slate-500 ml-1">({vertical.mainTeamKey})</span>
            )}
          </span>
          <GradeBadge grade={grade} size="sm" />
        </div>
        <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400 items-center">
          <span className="flex items-center gap-1">
            {stats.total} bugs
            {trend && <DeltaBadge delta={trend.bugs} compact />}
          </span>
          <span className={cn("font-semibold flex items-center gap-1", openColor)}>
            {stats.open} open
            {trend && <DeltaBadge delta={trend.open} compact />}
          </span>
          <span className="flex items-center gap-1">
            {stats.regression} regr.
            {trend && <DeltaBadge delta={trend.regressions} compact />}
          </span>
        </div>
        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
          {Object.keys(stats.subteams).length} sub-team{Object.keys(stats.subteams).length !== 1 ? "s" : ""}
        </div>
      </div>
    </Link>
  );
}
