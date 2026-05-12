import type {
  LinearBug,
  IncidentRecord,
  QaseProjectMetrics,
  Delta,
  TimePoint,
  VerticalTrend,
  TrendData,
  RangePreset,
  DashboardData,
} from "../types";
import { isOpen } from "../integrations/linear";

const RANGE_DAYS: Record<RangePreset, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  quarter: 90,
};

function makeDelta(
  current: number,
  previous: number,
  lowerIsBetter: boolean,
): Delta {
  const change = current - previous;
  const absPrev = Math.abs(previous);
  const changePercent =
    previous === 0 && current === 0
      ? 0
      : previous === 0
        ? null
        : Math.round((change / absPrev) * 100);

  const flat =
    (Math.abs(change) < 2 && (changePercent === null || Math.abs(changePercent) < 5)) ||
    (current === 0 && previous === 0);

  const direction: Delta["direction"] = flat ? "flat" : change > 0 ? "up" : "down";

  let sentiment: Delta["sentiment"] = "neutral";
  if (!flat) {
    if (lowerIsBetter) {
      sentiment = change < 0 ? "good" : "bad";
    } else {
      sentiment = change > 0 ? "good" : "bad";
    }
  }

  return { current, previous, change, changePercent, direction, sentiment };
}

function dayKey(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function inRange(dateStr: string, from: Date, to: Date): boolean {
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

export function computeRangeDates(range: RangePreset, now = new Date()) {
  const days = RANGE_DAYS[range];
  const currentEnd = new Date(now);
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - days);

  const previousEnd = new Date(currentStart);
  previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - days);

  const fetchFrom = previousStart;

  return { currentStart, currentEnd, previousStart, previousEnd, fetchFrom, days };
}

export function computeTrends(
  range: RangePreset,
  allBugs: LinearBug[],
  allIncidents: IncidentRecord[],
  allQase: QaseProjectMetrics[],
  now = new Date(),
): TrendData {
  const { currentStart, currentEnd, previousStart, previousEnd, days } =
    computeRangeDates(range, now);

  const curBugs = allBugs.filter((b) => inRange(b.createdAt, currentStart, currentEnd));
  const prevBugs = allBugs.filter((b) => inRange(b.createdAt, previousStart, previousEnd));

  const curIncidents = allIncidents.filter((i) => inRange(i.createdAt, currentStart, currentEnd));
  const prevIncidents = allIncidents.filter((i) => inRange(i.createdAt, previousStart, previousEnd));

  // Bug deltas
  const bugs = makeDelta(curBugs.length, prevBugs.length, true);
  const openBugs = makeDelta(
    curBugs.filter(isOpen).length,
    prevBugs.filter(isOpen).length,
    true,
  );
  const regressions = makeDelta(
    curBugs.filter((b) => b.type === "regression").length,
    prevBugs.filter((b) => b.type === "regression").length,
    true,
  );

  // Incident delta
  const incidents = makeDelta(curIncidents.length, prevIncidents.length, true);

  // MTTR delta
  const curResolved = curBugs.filter((b) => b.resolvedAt);
  const prevResolved = prevBugs.filter((b) => b.resolvedAt);
  const curMttr =
    curResolved.length > 0
      ? Math.round(
          curResolved.reduce(
            (s, b) => s + (new Date(b.resolvedAt!).getTime() - new Date(b.createdAt).getTime()) / 3600000,
            0,
          ) / curResolved.length,
        )
      : 0;
  const prevMttr =
    prevResolved.length > 0
      ? Math.round(
          prevResolved.reduce(
            (s, b) => s + (new Date(b.resolvedAt!).getTime() - new Date(b.createdAt).getTime()) / 3600000,
            0,
          ) / prevResolved.length,
        )
      : 0;
  const mttr = makeDelta(curMttr, prevMttr, true);

  // QASE: pass rate from runs in current vs previous
  const allRuns = allQase.flatMap((p) => p.runs).filter((r) => r.status === "complete");
  const curRuns = allRuns.filter((r) => inRange(r.startTime, currentStart, currentEnd));
  const prevRuns = allRuns.filter((r) => inRange(r.startTime, previousStart, previousEnd));
  const avgPassRate = (runs: typeof allRuns) => {
    if (runs.length === 0) return 0;
    const rates = runs.map((r) => (r.stats.total > 0 ? (r.stats.passed / r.stats.total) * 100 : 0));
    return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
  };
  const passRate = makeDelta(avgPassRate(curRuns), avgPassRate(prevRuns), false);

  // Coverage: cumulative, snapshot-style. Use current value only.
  const totalCases = allQase.reduce((s, p) => s + p.totalCases, 0);
  const automatedCases = allQase.reduce((s, p) => s + p.automatedCases, 0);
  const covPct = totalCases > 0 ? Math.round((automatedCases / totalCases) * 100) : 0;
  const coverage = makeDelta(covPct, covPct, false);

  // Time series: daily bug + incident counts for the current period
  const timeSeries: TimePoint[] = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(currentStart);
    date.setDate(date.getDate() + d);
    const key = dayKey(date.toISOString());
    timeSeries.push({
      date: key,
      bugs: curBugs.filter((b) => dayKey(b.createdAt) === key).length,
      regressions: curBugs.filter((b) => dayKey(b.createdAt) === key && b.type === "regression").length,
      incidents: curIncidents.filter((i) => dayKey(i.createdAt) === key).length,
    });
  }

  // Per-vertical trends
  const verticalNames = new Set([...curBugs.map((b) => b.vertical), ...prevBugs.map((b) => b.vertical)]);
  const verticalTrends: VerticalTrend[] = [...verticalNames].map((name) => {
    const vc = curBugs.filter((b) => b.vertical === name);
    const vp = prevBugs.filter((b) => b.vertical === name);
    return {
      name,
      bugs: makeDelta(vc.length, vp.length, true),
      open: makeDelta(vc.filter(isOpen).length, vp.filter(isOpen).length, true),
      regressions: makeDelta(
        vc.filter((b) => b.type === "regression").length,
        vp.filter((b) => b.type === "regression").length,
        true,
      ),
    };
  }).sort((a, b) => b.bugs.current - a.bugs.current);

  return {
    range,
    current: { start: dayKey(currentStart.toISOString()), end: dayKey(currentEnd.toISOString()) },
    previous: { start: dayKey(previousStart.toISOString()), end: dayKey(previousEnd.toISOString()) },
    bugs,
    openBugs,
    regressions,
    incidents,
    mttr,
    passRate,
    coverage,
    timeSeries,
    verticalTrends,
  };
}
