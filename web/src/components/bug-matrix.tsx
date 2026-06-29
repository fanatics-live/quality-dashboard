"use client";

import { useState } from "react";
import type { LinearBug } from "@/lib/types";
import { DetailModal, bugsToItems } from "./detail-modal";
import { cn } from "@/lib/utils";

const TYPES: { key: LinearBug["type"]; label: string; color: string }[] = [
  { key: "regression", label: "Regression", color: "#dc2626" },
  { key: "progression", label: "Progression", color: "#2563eb" },
  { key: "legacy", label: "Legacy", color: "#9333ea" },
  { key: "thirdParty", label: "3rd Party", color: "#0891b2" },
  { key: "unknown", label: "Unclassified", color: "#9ca3af" },
];

const SEVERITIES = ["Critical", "High", "Medium", "Low", "Unclassified"];
const ENVIRONMENTS = ["Production", "Staging", "Dogfood", "Development", "Unclassified"];

const SEV_HEAD: Record<string, string> = {
  Critical: "text-red-600 dark:text-red-400",
  High: "text-orange-600 dark:text-orange-400",
  Medium: "text-amber-600 dark:text-amber-400",
  Low: "text-slate-500 dark:text-slate-400",
  Unclassified: "text-slate-400 dark:text-slate-500",
};

interface Selection {
  title: string;
  color: string;
  bugs: LinearBug[];
}

function Cell({ bugs, title, color, emphasize, onSelect }: {
  bugs: LinearBug[];
  title: string;
  color: string;
  emphasize?: boolean;
  onSelect: (sel: Selection) => void;
}) {
  if (bugs.length === 0) {
    return <span className="text-slate-200 dark:text-slate-700">·</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onSelect({ title, color, bugs })}
      className={cn(
        "min-w-[1.75rem] px-1.5 py-0.5 rounded font-semibold tabular-nums hover:underline cursor-pointer",
        emphasize ? "text-red-700 dark:text-red-300" : "text-slate-700 dark:text-slate-200",
      )}
    >
      {bugs.length}
    </button>
  );
}

export function BugMatrix({ bugs }: { bugs: LinearBug[] }) {
  const [selected, setSelected] = useState<Selection | null>(null);

  if (bugs.length === 0) {
    return <p className="text-sm text-slate-400 italic">No data</p>;
  }

  // env → type → severity → bugs
  const pick = (env: string, type?: LinearBug["type"], sev?: string) =>
    bugs.filter(
      (b) =>
        b.environment === env &&
        (type === undefined || b.type === type) &&
        (sev === undefined || b.severity === sev),
    );

  const activeEnvs = ENVIRONMENTS.filter((e) => bugs.some((b) => b.environment === e));

  return (
    <div className="space-y-5">
      {activeEnvs.map((env) => {
        const isProd = env === "Production";
        const envBugs = bugs.filter((b) => b.environment === env);
        const activeTypes = TYPES.filter((t) => envBugs.some((b) => b.type === t.key));
        const activeSevs = SEVERITIES.filter(
          (s) => s !== "Unclassified" || envBugs.some((b) => b.severity === "Unclassified"),
        );
        return (
          <div key={env} className="overflow-x-auto">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn("text-xs font-semibold", isProd ? "text-red-700 dark:text-red-300" : "text-slate-700 dark:text-slate-300")}>{env}</span>
              <span className="text-[11px] text-slate-400">{envBugs.length}</span>
              {isProd && <span className="text-[10px] font-medium uppercase tracking-wide text-red-500/80">escaped</span>}
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-1.5 px-2 font-medium text-slate-400 uppercase tracking-wide text-[10px]">Bug Type</th>
                  {activeSevs.map((s) => (
                    <th key={s} className={cn("text-center py-1.5 px-2 font-semibold text-[10px] uppercase tracking-wide", SEV_HEAD[s])}>
                      {s === "Unclassified" ? "Uncl." : s}
                    </th>
                  ))}
                  <th className="text-center py-1.5 px-2 font-semibold text-[10px] uppercase tracking-wide text-slate-500">Total</th>
                </tr>
              </thead>
              <tbody>
                {activeTypes.map((t) => {
                  const typeBugs = envBugs.filter((b) => b.type === t.key);
                  return (
                    <tr
                      key={t.key}
                      className={cn(
                        "border-b border-slate-100 dark:border-slate-700/50",
                        isProd && "bg-red-50/60 dark:bg-red-900/10",
                      )}
                    >
                      <td className="py-1.5 px-2 font-medium text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm" style={{ background: t.color }} />
                          {t.label}
                        </span>
                      </td>
                      {activeSevs.map((sev) => (
                        <td key={sev} className="text-center py-1 px-2">
                          <Cell
                            bugs={pick(env, t.key, sev)}
                            title={`${env} · ${t.label} · ${sev}`}
                            color={t.color}
                            emphasize={isProd}
                            onSelect={setSelected}
                          />
                        </td>
                      ))}
                      <td className="text-center py-1 px-2">
                        <Cell
                          bugs={typeBugs}
                          title={`${env} · ${t.label}`}
                          color={t.color}
                          emphasize={isProd}
                          onSelect={setSelected}
                        />
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-200 dark:border-slate-600">
                  <td className="py-1.5 px-2 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Total</td>
                  {activeSevs.map((sev) => (
                    <td key={sev} className="text-center py-1 px-2">
                      <Cell
                        bugs={pick(env, undefined, sev)}
                        title={`${env} · ${sev}`}
                        color={isProd ? "#dc2626" : "#6366f1"}
                        emphasize={isProd}
                        onSelect={setSelected}
                      />
                    </td>
                  ))}
                  <td className="text-center py-1 px-2">
                    <Cell bugs={envBugs} title={env} color={isProd ? "#dc2626" : "#6366f1"} emphasize={isProd} onSelect={setSelected} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
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
