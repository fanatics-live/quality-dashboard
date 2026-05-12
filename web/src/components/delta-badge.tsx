import type { Delta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const SENTIMENT_COLORS: Record<string, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  bad: "text-red-600 dark:text-red-400",
  neutral: "text-slate-400 dark:text-slate-500",
};

const SENTIMENT_BG: Record<string, string> = {
  good: "bg-emerald-50 dark:bg-emerald-900/20",
  bad: "bg-red-50 dark:bg-red-900/20",
  neutral: "bg-slate-50 dark:bg-slate-800",
};

export function DeltaBadge({ delta, compact = false }: { delta: Delta; compact?: boolean }) {
  const Icon = delta.direction === "up" ? TrendingUp : delta.direction === "down" ? TrendingDown : Minus;
  const sign = delta.change > 0 ? "+" : "";
  const pctLabel = delta.changePercent !== null ? `${delta.changePercent}%` : "new";

  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", SENTIMENT_COLORS[delta.sentiment])}>
        <Icon className="w-3 h-3" />
        {pctLabel}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold",
        SENTIMENT_COLORS[delta.sentiment],
        SENTIMENT_BG[delta.sentiment],
      )}
    >
      <Icon className="w-3 h-3" />
      <span>{pctLabel}</span>
      <span className="text-[10px] opacity-70">({sign}{delta.change})</span>
    </span>
  );
}
