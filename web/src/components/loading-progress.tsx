"use client";

import type { SourceId, SourceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, AlertCircle, MinusCircle, Clock } from "lucide-react";

const SOURCE_META: Record<SourceId, { label: string; icon: string }> = {
  linear: { label: "Linear", icon: "/linear.svg" },
  incident: { label: "Incident.io", icon: "/incident.svg" },
  qase: { label: "QASE.io", icon: "/qase.svg" },
  datadog: { label: "Datadog APM", icon: "/datadog.svg" },
  processing: { label: "Computing metrics", icon: "" },
};

function StatusIcon({ status }: { status: SourceStatus }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case "loading":
      return <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />;
    case "error":
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    case "skipped":
      return <MinusCircle className="w-4 h-4 text-slate-400" />;
    default:
      return <Clock className="w-4 h-4 text-slate-300 dark:text-slate-600" />;
  }
}

const BAR_COLORS: Record<SourceStatus, string> = {
  waiting: "bg-slate-200 dark:bg-slate-700",
  loading: "bg-indigo-500",
  done: "bg-emerald-500",
  skipped: "bg-slate-300 dark:bg-slate-600",
  error: "bg-red-500",
};

const BAR_WIDTH: Record<SourceStatus, string> = {
  waiting: "w-0",
  loading: "w-2/3",
  done: "w-full",
  skipped: "w-full",
  error: "w-full",
};

export interface SourceState {
  status: SourceStatus;
  detail?: string;
}

export function LoadingProgress({ sources }: { sources: Record<SourceId, SourceState> }) {
  const entries = (Object.entries(sources) as [SourceId, SourceState][]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Quality Dashboard
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Collecting data from sources...
            </p>
          </div>

          {/* Progress bars */}
          <div className="space-y-4">
            {entries.map(([id, state]) => {
              const meta = SOURCE_META[id];
              return (
                <div key={id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={state.status} />
                      <span className={cn(
                        "text-sm font-medium",
                        state.status === "loading"
                          ? "text-slate-900 dark:text-slate-100"
                          : state.status === "done"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : state.status === "error"
                              ? "text-red-600 dark:text-red-400"
                              : "text-slate-400 dark:text-slate-500",
                      )}>
                        {meta.label}
                      </span>
                    </div>
                    {state.detail && (
                      <span className={cn(
                        "text-xs",
                        state.status === "error"
                          ? "text-red-500"
                          : "text-slate-400 dark:text-slate-500",
                      )}>
                        {state.detail}
                      </span>
                    )}
                  </div>
                  {/* Bar track */}
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-700 ease-out",
                        BAR_COLORS[state.status],
                        BAR_WIDTH[state.status],
                        state.status === "loading" && "animate-pulse",
                      )}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Overall progress */}
          <div className="text-center">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {entries.filter(([, s]) => s.status === "done" || s.status === "skipped").length} / {entries.length} complete
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
