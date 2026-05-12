import type { LinearBug } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_CLASSES: Record<string, string> = {
  regression: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  progression: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  unknown: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

const SEV_COLORS: Record<string, string> = {
  critical: "text-red-600",
  high: "text-orange-600",
  medium: "text-amber-500",
  low: "text-slate-500",
};

export function BugList({ bugs, limit = 30 }: { bugs: LinearBug[]; limit?: number }) {
  const shown = bugs.slice(0, limit);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 dark:border-slate-700">
            {["Title", "Sub-team", "Type", "Env", "Severity", "Status"].map((h) => (
              <th key={h} className="text-left py-2 px-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((b) => (
            <tr key={b.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="py-2 px-3 max-w-[300px]">
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline truncate block"
                >
                  {b.title.length > 70 ? b.title.slice(0, 67) + "..." : b.title}
                </a>
              </td>
              <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{b.subteam || "(main)"}</td>
              <td className="py-2 px-3">
                <span className={cn("inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold", TYPE_CLASSES[b.type])}>
                  {b.type}
                </span>
              </td>
              <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{b.environment}</td>
              <td className="py-2 px-3">
                <span className={cn("font-semibold", SEV_COLORS[b.severity])}>{b.severity}</span>
              </td>
              <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{b.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {bugs.length > limit && (
        <p className="text-xs text-slate-400 mt-2 px-3">
          Showing {limit} of {bugs.length} bugs
        </p>
      )}
    </div>
  );
}
