"use client";

import Link from "next/link";
import type { VerticalSummary, VerticalTrend } from "@/lib/types";
import { linearTeamUrl } from "@/lib/quality/links";
import { THRESHOLDS } from "@/lib/quality/thresholds";
import { GradeBadge } from "./grade-badge";
import { DeltaBadge } from "./delta-badge";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function VerticalCard({ vertical, trend }: { vertical: VerticalSummary; trend?: VerticalTrend }) {
  const { name, slug, grade, stats } = vertical;
  const openColor =
    stats.open > THRESHOLDS.teamOpenBugs.danger ? "text-red-600" : stats.open > THRESHOLDS.teamOpenBugs.warning ? "text-amber-500" : "text-emerald-600";

  return (
    <div className="group relative bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border-l-4 border-l-indigo-500 transition-all hover:-translate-y-0.5 hover:shadow-md">
      {/* Stretched link covers the card; the Linear anchor sits above it via z-10 */}
      <Link
        href={`/verticals/${slug}`}
        aria-label={`${name} details`}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      />
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
          {name}
          {vertical.mainTeamKey && (
            <a
              href={linearTeamUrl(vertical.mainTeamKey)}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 font-normal text-slate-400 dark:text-slate-500 ml-1 hover:text-indigo-500 focus-visible:text-indigo-500 inline-flex items-center gap-0.5"
            >
              ({vertical.mainTeamKey})
              <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" />
            </a>
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
  );
}
