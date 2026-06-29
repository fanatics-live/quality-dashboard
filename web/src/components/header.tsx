import { GradeBadge } from "./grade-badge";
import type { Grade } from "@/lib/types";

function formatAge(cachedAt: string): string {
  const diffMs = Date.now() - new Date(cachedAt).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function Header({ period, grade, cachedAt }: { period: { start: string; end: string }; grade: Grade; cachedAt?: string }) {
  const isStale = cachedAt && (Date.now() - new Date(cachedAt).getTime()) > 60 * 60_000;

  return (
    <header className="bg-gradient-to-r from-indigo-950 to-indigo-800 text-white print:bg-indigo-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Product Quality Intelligence</h1>
          <p className="text-indigo-200 text-xs sm:text-sm mt-0.5">
            Fanatics Live
            {cachedAt && (
              <span className={isStale ? "text-amber-300 ml-2" : "text-indigo-300 ml-2"}>
                · Updated {formatAge(cachedAt)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-white/15 px-3 py-1 rounded-full text-xs sm:text-sm">
            {period.start} → {period.end}
          </span>
          <GradeBadge grade={grade} size="md" />
        </div>
      </div>
    </header>
  );
}
