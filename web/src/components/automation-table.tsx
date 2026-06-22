import type { QaseProjectMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AutomationTable({ projects }: { projects: QaseProjectMetrics[] }) {
  if (projects.length === 0) {
    return <p className="text-sm text-slate-400 italic">No automation data available</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 dark:border-slate-700">
            {["Project", "Total Cases", "Automated", "Coverage", "Pass Rate", "Runs"].map((h) => (
              <th key={h} className="text-left py-2 px-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const cov = p.totalCases > 0 ? Math.round((p.automatedCases / p.totalCases) * 100) : 0;
            const lastRun = p.runs[0];
            const passRate = lastRun && lastRun.stats.total > 0
              ? Math.round((lastRun.stats.passed / lastRun.stats.total) * 100)
              : null;
            const covCls = cov >= 60 ? "text-emerald-600" : cov >= 30 ? "text-amber-500" : "text-red-600";
            const prCls = passRate !== null
              ? passRate >= 90 ? "text-emerald-600" : passRate >= 70 ? "text-amber-500" : "text-red-600"
              : "";

            return (
              <tr key={p.projectCode} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="py-2 px-3 font-semibold text-slate-700 dark:text-slate-300">{p.projectName}</td>
                <td className="py-2 px-3">{p.totalCases}</td>
                <td className="py-2 px-3">{p.automatedCases}</td>
                <td className="py-2 px-3">
                  <span className={cn("font-semibold", covCls)}>{cov}%</span>
                </td>
                <td className="py-2 px-3">
                  <span className={cn("font-semibold", prCls)}>
                    {passRate !== null ? `${passRate}%` : "N/A"}
                  </span>
                </td>
                <td className="py-2 px-3">{p.runs.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
