import type {
  LinearBug,
  IncidentRecord,
  QaseProjectMetrics,
  CycleDates,
  Delta,
  TimePoint,
  VerticalTrend,
  TrendData,
  RangePreset,
} from "../types";
import { isOpen, isValidBug, isClassificationBug } from "../integrations/linear";

const RANGE_DAYS: Record<string, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  quarter: 90,
};

export function makeDelta(
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

export function computeRangeDates(range: RangePreset, now = new Date(), cycleDates?: CycleDates) {
  if (range === "cycle" && cycleDates) {
    const currentStart = new Date(cycleDates.currentStart);
    const currentEnd = new Date(cycleDates.currentEnd);
    const previousStart = new Date(cycleDates.previousStart);
    const previousEnd = new Date(cycleDates.previousEnd);
    const days = Math.round((currentEnd.getTime() - currentStart.getTime()) / 86_400_000);
    return { currentStart, currentEnd, previousStart, previousEnd, fetchFrom: previousStart, days };
  }

  const days = RANGE_DAYS[range] ?? 14;
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
  cycleDates?: CycleDates,
): TrendData {
  const { currentStart, currentEnd, previousStart, previousEnd, days } =
    computeRangeDates(range, now, cycleDates);

  const validBugs = allBugs.filter(isValidBug);
  const curBugs = validBugs.filter((b) => inRange(b.createdAt, currentStart, currentEnd));
  const prevBugs = validBugs.filter((b) => inRange(b.createdAt, previousStart, previousEnd));

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
  const progressions = makeDelta(
    curBugs.filter((b) => b.type === "progression").length,
    prevBugs.filter((b) => b.type === "progression").length,
    true,
  );
  const unknownType = makeDelta(
    curBugs.filter((b) => b.type === "unknown").length,
    prevBugs.filter((b) => b.type === "unknown").length,
    true,
  );

  // Incident delta
  const incidents = makeDelta(curIncidents.length, prevIncidents.length, true);

  // Classification-scoped deltas (same population as the classification boards)
  const curClassified = curBugs.filter(isClassificationBug);
  const prevClassified = prevBugs.filter(isClassificationBug);
  const classDelta = (type: LinearBug["type"]) =>
    makeDelta(
      curClassified.filter((b) => b.type === type).length,
      prevClassified.filter((b) => b.type === type).length,
      true,
    );
  const classification = {
    regressions: classDelta("regression"),
    progressions: classDelta("progression"),
    unknown: classDelta("unknown"),
  };

  // MTTR delta — bugs RESOLVED in each window (avoids survivorship bias
  // of only counting bugs both created and resolved within the window)
  const curResolved = validBugs.filter((b) => b.resolvedAt && inRange(b.resolvedAt, currentStart, currentEnd));
  const prevResolved = validBugs.filter((b) => b.resolvedAt && inRange(b.resolvedAt, previousStart, previousEnd));
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
    const total = runs.reduce((s, r) => s + r.stats.total, 0);
    if (total === 0) return 0;
    const passed = runs.reduce((s, r) => s + r.stats.passed, 0);
    return Math.round((passed / total) * 100);
  };
  const passRate = makeDelta(avgPassRate(curRuns), avgPassRate(prevRuns), false);

  // Time series: daily + cumulative bug counts and daily incident counts
  const timeSeries: TimePoint[] = [];
  let cumBugs = 0;
  let cumRegressions = 0;
  for (let d = 0; d < days; d++) {
    const date = new Date(currentStart);
    date.setDate(date.getDate() + d);
    const key = dayKey(date.toISOString());
    const dayBugs = curBugs.filter((b) => dayKey(b.createdAt) === key).length;
    const dayReg = curBugs.filter((b) => dayKey(b.createdAt) === key && b.type === "regression").length;
    cumBugs += dayBugs;
    cumRegressions += dayReg;
    timeSeries.push({
      date: key,
      bugs: dayBugs,
      regressions: dayReg,
      incidents: curIncidents.filter((i) => dayKey(i.createdAt) === key).length,
      cumulativeBugs: cumBugs,
      cumulativeRegressions: cumRegressions,
    });
  }

  // Map Linear team key (issue prefix, e.g. "LB" in "LB-1959") to its vertical,
  // so incidents linked to a Linear ticket can be attributed to a vertical.
  const teamVertical = new Map<string, string>();
  for (const b of validBugs) teamVertical.set(b.teamKey, b.vertical);
  const incidentVertical = (i: IncidentRecord): string | undefined => {
    const prefix = i.linearKey?.split("-")[0];
    return prefix ? teamVertical.get(prefix) : undefined;
  };

  // Per-vertical trends
  const verticalNames = new Set([...curBugs.map((b) => b.vertical), ...prevBugs.map((b) => b.vertical)]);
  const verticalTrends: VerticalTrend[] = [...verticalNames].map((name) => {
    const vc = curBugs.filter((b) => b.vertical === name);
    const vp = prevBugs.filter((b) => b.vertical === name);
    const vci = curIncidents.filter((i) => incidentVertical(i) === name);
    const vpi = prevIncidents.filter((i) => incidentVertical(i) === name);
    const vcClass = curClassified.filter((b) => b.vertical === name);
    const vpClass = prevClassified.filter((b) => b.vertical === name);
    const vClassDelta = (type: LinearBug["type"]) =>
      makeDelta(
        vcClass.filter((b) => b.type === type).length,
        vpClass.filter((b) => b.type === type).length,
        true,
      );
    return {
      name,
      bugs: makeDelta(vc.length, vp.length, true),
      open: makeDelta(vc.filter(isOpen).length, vp.filter(isOpen).length, true),
      regressions: makeDelta(
        vc.filter((b) => b.type === "regression").length,
        vp.filter((b) => b.type === "regression").length,
        true,
      ),
      progressions: makeDelta(
        vc.filter((b) => b.type === "progression").length,
        vp.filter((b) => b.type === "progression").length,
        true,
      ),
      incidents: makeDelta(vci.length, vpi.length, true),
      classification: {
        regressions: vClassDelta("regression"),
        progressions: vClassDelta("progression"),
        unknown: vClassDelta("unknown"),
      },
    };
  }).sort((a, b) => b.bugs.current - a.bugs.current);

  return {
    range,
    current: { start: dayKey(currentStart.toISOString()), end: dayKey(currentEnd.toISOString()) },
    previous: { start: dayKey(previousStart.toISOString()), end: dayKey(previousEnd.toISOString()) },
    bugs,
    openBugs,
    regressions,
    progressions,
    unknownType,
    incidents,
    mttr,
    passRate,
    classification,
    timeSeries,
    verticalTrends,
  };
}
