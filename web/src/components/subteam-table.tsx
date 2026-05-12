import type { TeamStats } from "@/lib/types";
import { linearTeamUrl, linearFilterUrl } from "@/lib/quality/links";
import { cn } from "@/lib/utils";

function LinkedCount({ count, url, className }: { count: number; url: string; className?: string }) {
  if (count === 0) return <span className="text-slate-300 dark:text-slate-600">0</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("font-semibold hover:underline", className)}
    >
      {count}
    </a>
  );
}

export function SubteamTable({ subteams }: { subteams: Record<string, TeamStats> }) {
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
            <th className="text-left py-2 px-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">Sub-team</th>
            <th className="text-left py-2 px-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">Total</th>
            <th className="text-left py-2 px-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">Triage</th>
            <th className="text-left py-2 px-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">Open</th>
            <th className="text-left py-2 px-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">Regr.</th>
            <th className="text-left py-2 px-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">Regr. %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, s]) => {
            const rPct = s.total > 0 ? Math.round((s.regression / s.total) * 100) : 0;
            const rCls = rPct > 30 ? "text-red-600 font-bold" : rPct > 15 ? "text-amber-500 font-bold" : "";
            const openCls = s.open > 5 ? "text-red-600" : s.open > 2 ? "text-amber-500" : "text-emerald-600";

            return (
              <tr key={name} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-300">{name}</td>
                <td className="py-2 px-3">
                  <LinkedCount count={s.total} url={linearTeamUrl(s.teamKey, "all")} className="text-indigo-600 dark:text-indigo-400" />
                </td>
                <td className="py-2 px-3">
                  <LinkedCount count={s.triage} url={linearTeamUrl(s.teamKey, "triage")} className="text-amber-500" />
                </td>
                <td className="py-2 px-3">
                  <LinkedCount count={s.open} url={linearTeamUrl(s.teamKey, "active")} className={openCls} />
                </td>
                <td className="py-2 px-3">
                  <LinkedCount count={s.regression} url={linearFilterUrl(s.teamKey, { label: "Regression bug" })} className="text-red-600" />
                </td>
                <td className="py-2 px-3">
                  <span className={rCls}>{rPct}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
