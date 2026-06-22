"use client";

import { useState } from "react";
import Link from "next/link";
import type { TeamRisk } from "@/lib/types";
import { DeltaBadge } from "./delta-badge";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { THRESHOLDS } from "@/lib/quality/thresholds";

const RISK_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  watch: "bg-amber-400",
  stable: "bg-slate-300 dark:bg-slate-600",
  improving: "bg-emerald-500",
};

const RISK_TEXT: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  watch: "text-amber-600 dark:text-amber-400",
  stable: "text-slate-500 dark:text-slate-400",
  improving: "text-emerald-600 dark:text-emerald-400",
};

const RISK_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  watch: "Watch",
  stable: "Stable",
  improving: "Improving",
};

export function TeamRanking({ teams }: { teams: TeamRisk[] }) {
  if (teams.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm overflow-visible">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
        Team Health Ranking
      </h3>
      <div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 dark:border-slate-700">
              <th className="text-left py-2 px-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold w-6">#</th>
              <th className="text-left py-2 px-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">Team</th>
              <HeaderCell label="Risk" align="left" info="Risk level based on open criticals, regression rate, bug aging, volume trend, and open bug count." />
              <HeaderCell label="Bugs" info="Total bugs reported for this team during the selected period (excludes canceled/invalid)." />
              <HeaderCell label="Open" info="Bugs still unresolved: in triage, backlog, unstarted, or in progress." />
              <HeaderCell label="Regr." info="Regressions — features that previously worked but broke after a code change. Shown with the regression rate (%)." />
              <HeaderCell label="Criticals" info="Bugs marked Critical severity that are still open." />
              <HeaderCell label="Aging 30d+" info="Open bugs older than 30 days. Includes aging (30-60d), stale (60-90d), and critical (90d+) buckets." />
              <HeaderCell label="Trend" info="Bug volume change compared to the previous period of the same length." />
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => {
              const aging30Plus = t.aging.aging + t.aging.stale + t.aging.critical;
              const openColor =
                t.stats.open > THRESHOLDS.teamOpenBugs.danger ? "text-red-600 font-bold" :
                t.stats.open > THRESHOLDS.teamOpenBugs.warning ? "text-amber-500 font-semibold" :
                "text-emerald-600";

              return (
                <tr key={t.name} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-2 px-2 text-slate-400 dark:text-slate-500 font-mono text-xs">{i + 1}</td>
                  <td className="py-2 px-2">
                    <Link href={`/verticals/${t.slug}`} className="font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                      {t.name}
                    </Link>
                  </td>
                  <td className="py-2 px-2">
                    <RiskCell risk={t} />
                  </td>
                  <td className="py-2 px-2 text-right font-semibold text-slate-700 dark:text-slate-300">{t.stats.total}</td>
                  <td className={cn("py-2 px-2 text-right", openColor)}>{t.stats.open}</td>
                  <td className="py-2 px-2 text-right">
                    <span className={t.stats.regression > THRESHOLDS.teamRegressions.danger ? "text-red-600 font-bold" : "text-slate-600 dark:text-slate-400"}>
                      {t.stats.regression}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs ml-0.5">({t.regressionRate}%)</span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span className={t.openCriticals > 0 ? "text-red-600 font-bold" : "text-slate-400"}>
                      {t.openCriticals}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span className={aging30Plus > THRESHOLDS.teamAging30Plus.warning ? "text-orange-600 font-bold" : "text-slate-600 dark:text-slate-400"}>
                      {aging30Plus}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <DeltaBadge delta={t.bugsDelta} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {(() => {
              const totBugs = teams.reduce((s, t) => s + t.stats.total, 0);
              const totOpen = teams.reduce((s, t) => s + t.stats.open, 0);
              const totRegr = teams.reduce((s, t) => s + t.stats.regression, 0);
              const totCrit = teams.reduce((s, t) => s + t.openCriticals, 0);
              const totAging = teams.reduce((s, t) => s + t.aging.aging + t.aging.stale + t.aging.critical, 0);
              const regrRate = totBugs > 0 ? Math.round((totRegr / totBugs) * 100) : 0;
              return (
                <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                  <td className="py-2 px-2" />
                  <td className="py-2 px-2 font-bold text-slate-700 dark:text-slate-300">Total</td>
                  <td className="py-2 px-2" />
                  <td className="py-2 px-2 text-right font-bold text-slate-700 dark:text-slate-300">{totBugs}</td>
                  <td className="py-2 px-2 text-right font-bold text-slate-700 dark:text-slate-300">{totOpen}</td>
                  <td className="py-2 px-2 text-right font-bold text-slate-700 dark:text-slate-300">
                    {totRegr}
                    <span className="text-slate-400 dark:text-slate-500 text-xs ml-0.5">({regrRate}%)</span>
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-slate-700 dark:text-slate-300">{totCrit}</td>
                  <td className="py-2 px-2 text-right font-bold text-slate-700 dark:text-slate-300">{totAging}</td>
                  <td className="py-2 px-2" />
                </tr>
              );
            })()}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function RiskCell({ risk }: { risk: TeamRisk }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex items-center gap-1.5 cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className={cn("w-2 h-2 rounded-full", RISK_DOT[risk.level])} />
      <span className={cn("text-xs font-semibold", RISK_TEXT[risk.level])}>{RISK_LABEL[risk.level]}</span>
      {open && risk.signals.length > 0 && (
        <div className="absolute left-0 bottom-full mb-1.5 z-50 w-64 p-2.5 rounded-lg shadow-lg bg-slate-800 dark:bg-slate-700 text-[11px] text-slate-100 pointer-events-none">
          <p className="font-semibold mb-1.5">{risk.name}</p>
          {risk.signals.map((s, i) => (
            <p key={i} className="py-0.5">• {s}</p>
          ))}
          <div className="absolute left-4 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-slate-800 dark:border-t-slate-700" />
        </div>
      )}
    </span>
  );
}

function HeaderCell({ label, info, align = "right" }: { label: string; info: string; align?: "left" | "right" }) {
  return (
    <th className={`${align === "left" ? "text-left" : "text-right"} py-2 px-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold`}>
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {label}
        <span className="relative group" tabIndex={0} aria-label={`About ${label}`}>
          <Info className="w-3 h-3 text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 cursor-help transition-colors" />
          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-50 w-52 px-2.5 py-2 rounded-lg bg-slate-800 dark:bg-slate-700 text-[11px] text-slate-100 leading-relaxed font-normal normal-case tracking-normal shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            {info}
            <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-slate-800 dark:border-t-slate-700" />
          </span>
        </span>
      </span>
    </th>
  );
}
