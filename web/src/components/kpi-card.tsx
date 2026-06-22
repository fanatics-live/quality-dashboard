import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Accent = "default" | "danger" | "warning" | "success" | "info";

const ACCENT_BORDER: Record<Accent, string> = {
  default: "border-l-indigo-500",
  danger: "border-l-red-500",
  warning: "border-l-amber-500",
  success: "border-l-emerald-500",
  info: "border-l-blue-500",
};

export function KpiCard({
  value,
  label,
  detail,
  accent = "default",
  icon,
  delta,
  sparkline,
  href,
}: {
  value: string | number;
  label: string;
  detail?: string;
  accent?: Accent;
  icon?: ReactNode;
  delta?: ReactNode;
  sparkline?: ReactNode;
  href?: string;
}) {
  const content = (
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            {value}
          </span>
          {delta}
        </div>
        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-0.5">
          {label}
        </div>
        {detail && (
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{detail}</div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        {icon && <div className="text-slate-400 dark:text-slate-500">{icon}</div>}
        {sparkline && <div className="mt-1">{sparkline}</div>}
      </div>
    </div>
  );

  const cls = cn(
    "bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border-l-4 transition-colors",
    ACCENT_BORDER[accent],
    href && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all",
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {content}
      </a>
    );
  }

  return <div className={cls}>{content}</div>;
}
