"use client";

import type { EnvFilter } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPTIONS: { value: EnvFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Development", label: "Dev" },
  { value: "Staging", label: "Staging" },
  { value: "Dogfood", label: "Dogfood" },
  { value: "Production", label: "Prod" },
];

export function EnvSelector({
  value,
  onChange,
  available,
}: {
  value: EnvFilter;
  onChange: (e: EnvFilter) => void;
  // Environments that actually have data. "all" is always shown; the current
  // value is always kept so a URL-forced selection never vanishes.
  available?: EnvFilter[];
}) {
  const options = available
    ? OPTIONS.filter((o) => o.value === "all" || o.value === value || available.includes(o.value))
    : OPTIONS;
  return (
    <div className="inline-flex items-center gap-2 print:hidden">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Env</span>
      <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              value === o.value
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
