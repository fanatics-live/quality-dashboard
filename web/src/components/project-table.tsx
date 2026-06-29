"use client";

import { useState } from "react";
import type { LinearProject, LinearBug } from "@/lib/types";
import { DetailModal, bugsToItems } from "./detail-modal";
import { cn } from "@/lib/utils";

const ENV_ORDER = ["Production", "Staging", "Development", "Dogfood", "Unclassified"];
const ENV_COLOR: Record<string, string> = {
  Production: "#dc2626",
  Staging: "#f59e0b",
  Development: "#2563eb",
  Dogfood: "#9333ea",
  Unclassified: "#9ca3af",
};
const ENV_ABBR: Record<string, string> = {
  Production: "Prod",
  Staging: "Stg",
  Development: "Dev",
  Dogfood: "Dgf",
  Unclassified: "Unc",
};
const ENV_CHIP: Record<string, string> = {
  Production: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  Staging: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
  Development: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  Dogfood: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
  Unclassified: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

const HEALTH_LABEL: Record<string, string> = {
  onTrack: "On track",
  atRisk: "At risk",
  offTrack: "Off track",
};

const HEALTH_CLASSES: Record<string, string> = {
  onTrack: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
  atRisk: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
  offTrack: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
};

function fmtDate(d?: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface Selection {
  title: string;
  color: string;
  bugs: LinearBug[];
}

export function ProjectTable({
  projects,
  bugsByProject,
}: {
  projects: LinearProject[];
  bugsByProject: Record<string, LinearBug[]>;
}) {
  const [selected, setSelected] = useState<Selection | null>(null);

  if (projects.length === 0) {
    return <p className="text-sm text-slate-400 italic">No projects in progress</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 dark:border-slate-700">
            {["Project", "Health", "Progress", "Bugs (by env)", "Lead", "Target"].map((h) => (
              <th key={h} className="text-left py-2 px-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const pct = Math.round((p.progress ?? 0) * 100);
            const projectBugs = bugsByProject[p.id] ?? [];
            const envCounts: Record<string, number> = {};
            for (const b of projectBugs) {
              envCounts[b.environment] = (envCounts[b.environment] ?? 0) + 1;
            }
            return (
              <tr key={p.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="py-2 px-3 max-w-[320px]">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline truncate block"
                  >
                    {p.name}
                  </a>
                </td>
                <td className="py-2 px-3">
                  {p.health ? (
                    <span className={cn("inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold", HEALTH_CLASSES[p.health] ?? "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400")}>
                      {HEALTH_LABEL[p.health] ?? p.health}
                    </span>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">—</span>
                  )}
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2 min-w-[7rem]">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular-nums text-slate-500 dark:text-slate-400 text-[11px] w-8 text-right">{pct}%</span>
                  </div>
                </td>
                <td className="py-2 px-3">
                  {projectBugs.length === 0 ? (
                    <span className="text-slate-300 dark:text-slate-600">0</span>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSelected({ title: `${p.name} · All`, color: "#6366f1", bugs: projectBugs })}
                        className="font-semibold tabular-nums text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
                      >
                        {projectBugs.length}
                      </button>
                      {ENV_ORDER.filter((e) => envCounts[e]).map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() =>
                            setSelected({
                              title: `${p.name} · ${e}`,
                              color: ENV_COLOR[e],
                              bugs: projectBugs.filter((b) => b.environment === e),
                            })
                          }
                          className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold transition-opacity hover:opacity-80",
                            ENV_CHIP[e],
                          )}
                        >
                          {ENV_ABBR[e]} {envCounts[e]}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{p.lead ?? "—"}</td>
                <td className="py-2 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{fmtDate(p.targetDate)}</td>
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
