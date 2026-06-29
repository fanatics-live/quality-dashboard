import type { LinearBug } from "@/lib/types";
import { cn, priorityLabel } from "@/lib/utils";

const TYPE_CLASSES: Record<string, string> = {
  regression: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  progression: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  unknown: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

const SEV_COLORS: Record<string, string> = {
  Critical: "text-red-600 font-bold",
  High: "text-orange-600 font-semibold",
  Medium: "text-amber-500",
  Low: "text-slate-400",
  Unclassified: "text-slate-400",
};

// Linear priority: 1 = Urgent, 2 = High, 3 = Medium, 4 = Low, 0 = None.
const PRIORITY_COLORS: Record<number, string> = {
  1: "text-red-600 font-bold",
  2: "text-orange-600 font-semibold",
  3: "text-amber-500",
  4: "text-slate-400",
};

export function BugList({ bugs }: { bugs: LinearBug[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 dark:border-slate-700">
            {["Title", "Sub-team", "Type", "Env", "Severity / Priority", "Status"].map((h) => (
              <th key={h} className="text-left py-2 px-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bugs.map((b) => (
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
              <td className="py-2 px-3 whitespace-nowrap">
                <span className={cn("font-semibold", SEV_COLORS[b.severity] ?? "text-slate-400")}>{b.severity}</span>
                <span className="text-slate-300 dark:text-slate-600 mx-1">/</span>
                <span className={cn(PRIORITY_COLORS[b.priority] ?? "text-slate-400")}>{priorityLabel(b.priority)}</span>
              </td>
              <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{b.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
