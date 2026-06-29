"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { DashboardWithTrendsV2, SourceId, ProgressEvent, RangePreset } from "@/lib/types";
import { LoadingProgress, type SourceState } from "./loading-progress";
import { DashboardContent } from "./dashboard-content";

const INITIAL_SOURCES: Record<SourceId, SourceState> = {
  linear: { status: "waiting" },
  incident: { status: "waiting" },
  qase: { status: "waiting" },
  datadog: { status: "waiting" },
  processing: { status: "waiting" },
};

const VALID_RANGES = new Set(["14d", "30d", "quarter", "cycle"]);

export function DashboardShell() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rangeParam = searchParams.get("range") ?? "14d";
  const range: RangePreset = VALID_RANGES.has(rangeParam) ? (rangeParam as RangePreset) : "14d";

  const [result, setResult] = useState<DashboardWithTrendsV2 | null>(null);
  const [sources, setSources] = useState<Record<SourceId, SourceState>>(INITIAL_SOURCES);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback((r: RangePreset, refresh = false) => {
    setLoading(true);
    setError(null);
    setSources({ ...INITIAL_SOURCES });

    const url = `/api/quality/stream?range=${r}${refresh ? "&refresh=1" : ""}`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener("progress", (e) => {
      const evt: ProgressEvent = JSON.parse(e.data);
      setSources((prev) => ({
        ...prev,
        [evt.source]: { status: evt.status, detail: evt.detail },
      }));
    });

    eventSource.addEventListener("complete", (e) => {
      const payload: DashboardWithTrendsV2 = JSON.parse(e.data);
      setResult(payload);
      setLoading(false);
      eventSource.close();
    });

    eventSource.addEventListener("error", (e) => {
      if (e instanceof MessageEvent) {
        const payload = JSON.parse(e.data);
        setError(payload.message);
      } else {
        setError("Connection lost");
      }
      setLoading(false);
      eventSource.close();
    });

    return () => eventSource.close();
  }, []);

  useEffect(() => {
    const cleanup = fetchData(range);
    return cleanup;
  }, [range, fetchData]);

  const handleRangeChange = useCallback((newRange: RangePreset) => {
    router.push(`/?range=${newRange}`, { scroll: false });
  }, [router]);

  const handleRefresh = useCallback(() => {
    setResult(null);
    fetchData(range, true);
  }, [range, fetchData]);

  if (error && !result) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 max-w-md text-center space-y-4">
          <div className="text-red-500 text-4xl">!</div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Failed to load</h2>
          <p className="text-sm text-slate-500">{error}</p>
          <button
            onClick={() => fetchData(range)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading || !result) {
    return <LoadingProgress sources={sources} />;
  }

  return (
    <DashboardContent
      data={result.data}
      trends={result.trends}
      exec={result.exec}
      range={range}
      onRangeChange={handleRangeChange}
      onRefresh={handleRefresh}
      cachedAt={result.cachedAt}
      sourceErrors={result.sourceErrors}
    />
  );
}
