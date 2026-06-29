"use client";

import { useState } from "react";
import type { LinearBug, TeamStats } from "@/lib/types";
import { DetailModal, bugsToItems } from "./detail-modal";
import { cn } from "@/lib/utils";

const OPEN_STATES = new Set(["triage", "backlog", "unstarted", "started"]);

interface Selection {
  title: string;
  color: string;
  bugs: LinearBug[];
}

function CountCell({
  count,
  bugs,
  title,
  color,
  className,
  onSelect,
}: {
  count: number;
  bugs: LinearBug[];
  title: string;
  color: string;
  className?: string;
  onSelect: (sel: Selection) => void;
}) {
  if (count === 0) return <span className="text-slate-300 dark:text-slate-600">0</span>;
  return (
    <button
      type="button"
      onClick={() => onSelect({ title, color, bugs })}
      className={cn("font-semibold hover:underline cursor-pointer", className)}
    >
      {count}
    </button>
  );
}

export function SubteamTable({
  subteams,
  bugsBySubteam,
}: {
  subteams: Record<string, TeamStats>;
  bugsBySubteam: Record<string, LinearBug[]>;
}) {
  const [selected, setSelected] = useState<Selection | null>(null);

  const rows = Object.entries(subteams).sort(([a], [b]) => {
    if (a === "(main)") return -1;
    if (b === "(main)") return 1;
    return 0;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 dark:border-slate-700">
            {["Sub-team", "Total", "Triage", "Newly Open", "Regr.", "Progr.", "Legacy", "3rd Party", "Regr. %"].map((h) => (
              <th key={h} className="text-left py-2 px-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, s]) => {
            const rPct = s.total > 0 ? Math.round((s.regression / s.total) * 100) : 0;
            const rCls = rPct > 30 ? "text-red-600 font-bold" : rPct > 15 ? "text-amber-500 font-bold" : "";
            const openCls = s.open > 5 ? "text-red-600" : s.open > 2 ? "text-amber-500" : "text-emerald-600";

            const all = bugsBySubteam[name] ?? [];
            const triage = all.filter((b) => b.stateType === "triage");
            const open = all.filter((b) => OPEN_STATES.has(b.stateType));
            const regression = all.filter((b) => b.type === "regression");
            const progression = all.filter((b) => b.type === "progression");
            const legacy = all.filter((b) => b.type === "legacy");
            const thirdParty = all.filter((b) => b.type === "thirdParty");

            return (
              <tr key={name} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-300">{name}</td>
                <td className="py-2 px-3">
                  <CountCell count={s.total} bugs={all} title={`${name} · Total`} color="#6366f1" className="text-indigo-600 dark:text-indigo-400" onSelect={setSelected} />
                </td>
                <td className="py-2 px-3">
                  <CountCell count={s.triage} bugs={triage} title={`${name} · Triage`} color="#f59e0b" className="text-amber-500" onSelect={setSelected} />
                </td>
                <td className="py-2 px-3">
                  <CountCell count={s.open} bugs={open} title={`${name} · Newly Open`} color="#10b981" className={openCls} onSelect={setSelected} />
                </td>
                <td className="py-2 px-3">
                  <CountCell count={s.regression} bugs={regression} title={`${name} · Regressions`} color="#dc2626" className="text-red-600" onSelect={setSelected} />
                </td>
                <td className="py-2 px-3">
                  <CountCell count={s.progression} bugs={progression} title={`${name} · Progressions`} color="#2563eb" className="text-blue-600 dark:text-blue-400" onSelect={setSelected} />
                </td>
                <td className="py-2 px-3">
                  <CountCell count={legacy.length} bugs={legacy} title={`${name} · Legacy`} color="#9333ea" className="text-purple-600 dark:text-purple-400" onSelect={setSelected} />
                </td>
                <td className="py-2 px-3">
                  <CountCell count={thirdParty.length} bugs={thirdParty} title={`${name} · 3rd Party`} color="#0891b2" className="text-cyan-600 dark:text-cyan-400" onSelect={setSelected} />
                </td>
                <td className="py-2 px-3">
                  <span className={rCls}>{rPct}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selected && (
        <DetailModal
          title={selected.title}
          color={selected.color}
          items={bugsToItems(selected.bugs)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
