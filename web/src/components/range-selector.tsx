"use client";

import type { RangePreset } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "14d", label: "14D" },
  { value: "30d", label: "30D" },
  { value: "quarter", label: "Quarter" },
  { value: "cycle", label: "Cycle" },
];

export function RangeSelector({
  value,
  onChange,
  comparison,
}: {
  value: RangePreset;
  onChange: (r: RangePreset) => void;
  comparison?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-1 print:hidden">
      <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              value === p.value
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {comparison && (
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          vs {comparison}
        </span>
      )}
    </div>
  );
}
