"use client";

import { useState } from "react";
import Link from "next/link";
import type { OkrVerticalComparison } from "@/lib/types";
import { slug } from "@/lib/utils";
import { Target, TrendingDown, TrendingUp, Minus, Info } from "lucide-react";

function TrendBadge({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-[11px] font-semibold text-slate-400">new</span>;
  }
  const improving = change < 0;
  const flat = change === 0;
  const Icon = flat ? Minus : improving ? TrendingDown : TrendingUp;
  const color = flat
    ? "text-slate-400"
    : improving
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums ${color}`}>
      <Icon className="w-3 h-3" />
      {change > 0 ? "+" : ""}{change}%
    </span>
  );
}

function VerticalRow({ vertical, q1, q2, changePercent }: { vertical: string; q1: number; q2: number; changePercent: number | null }) {
  const [hover, setHover] = useState(false);
  const diff = q2 - q1;
  return (
    <div className="relative">
      <div
        className="flex items-center justify-between gap-2 py-1.5 px-1 border-b border-slate-100 dark:border-slate-700/50 last:border-0"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <Link
          href={`/verticals/${slug(vertical)}`}
          className="text-xs text-slate-600 dark:text-slate-300 truncate hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors"
        >
          {vertical}
        </Link>
        <TrendBadge change={changePercent} />
      </div>
      {hover && (
        <div className="absolute right-0 bottom-full mb-1 z-50 w-48 p-2 rounded-lg shadow-lg bg-slate-800 dark:bg-slate-700 text-[11px] text-slate-100 pointer-events-none">
          <div className="flex justify-between"><span>Q1</span><span className="font-semibold tabular-nums">{q1}</span></div>
          <div className="flex justify-between"><span>Q2</span><span className="font-semibold tabular-nums">{q2}</span></div>
          <div className="flex justify-between border-t border-slate-600 mt-1 pt-1">
            <span>Change</span>
            <span className="font-semibold tabular-nums">{diff > 0 ? "+" : ""}{diff}{changePercent !== null ? ` (${changePercent > 0 ? "+" : ""}${changePercent}%)` : ""}</span>
          </div>
          <div className="absolute right-4 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-slate-800 dark:border-t-slate-700" />
        </div>
      )}
    </div>
  );
}

function KrCard({ label, title, info, data, target }: {
  label: string;
  title: string;
  info: React.ReactNode;
  data: OkrVerticalComparison;
  target: number;
}) {
  const met = data.changePercent !== null && data.changePercent <= target;
  const badgeText = `${data.q1Total} → ${data.q2Total} · ${data.changePercent !== null ? `${data.changePercent > 0 ? "+" : ""}${data.changePercent}%` : "—"}`;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">{label}</span>
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            met
              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
          }`}
        >
          {badgeText}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 pb-2 border-b border-slate-200 dark:border-slate-700 flex items-start gap-1.5">
        <span className="flex-1">{title}</span>
        <span className="relative group shrink-0 mt-0.5">
          <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
          <span className="absolute right-0 bottom-full mb-2 w-64 px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] leading-relaxed shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
            {info}
            <span className="absolute right-1.5 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
          </span>
        </span>
      </h3>
      {data.byVertical.map((v) => (
        <VerticalRow key={v.vertical} vertical={v.vertical} q1={v.q1} q2={v.q2} changePercent={v.changePercent} />
      ))}
    </div>
  );
}

export function Kr1ProdDefectsSection({ kr1, kr2 }: { kr1: OkrVerticalComparison; kr2: OkrVerticalComparison }) {
  if (kr1.byVertical.length === 0 && kr2.byVertical.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-3">
        <Target className="w-4 h-4 text-indigo-500" />
        OKRs — Q2 2026
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KrCard
          label="KR1"
          title="Reduce prod functional defects by 30%"
          data={kr1}
          target={-30}
          info={
            <>
              Production-environment defects, <strong>Q2 vs Q1 2026</strong>, broken down by vertical.<br />
              Excludes canceled, triage and invalid statuses.<br />
              Target: <strong>−30%</strong>
            </>
          }
        />
        <KrCard
          label="KR2"
          title="Reduce release-blocking defects by 30% per client release"
          data={kr2}
          target={-30}
          info={
            <>
              Defects with the <strong>Release Blocker</strong> label, <strong>Q2 vs Q1 2026</strong>, broken down by vertical.<br />
              Excludes canceled, triage and invalid statuses.<br />
              Target: <strong>−30%</strong> on average per client release (esp. post code-freeze).
            </>
          }
        />
      </div>
    </section>
  );
}
