import { describe, it, expect } from "vitest";
import { makeDelta, computeRangeDates, computeTrends } from "../trends";
import { makeBug } from "../../__tests__/fixtures";
import type { CycleDates, QaseProjectMetrics } from "../../types";

const NOW = new Date("2026-06-08T12:00:00.000Z");

describe("makeDelta", () => {
  it("flags an increase as bad when lower is better", () => {
    const d = makeDelta(10, 5, true);
    expect(d).toMatchObject({ change: 5, changePercent: 100, direction: "up", sentiment: "bad" });
  });

  it("flags a decrease as good when lower is better", () => {
    expect(makeDelta(5, 10, true).sentiment).toBe("good");
  });

  it("flags an increase as good when higher is better", () => {
    expect(makeDelta(10, 5, false).sentiment).toBe("good");
  });

  it("treats small absolute and relative changes as flat", () => {
    const d = makeDelta(101, 100, true);
    expect(d.direction).toBe("flat");
    expect(d.sentiment).toBe("neutral");
  });

  it("handles zero-to-zero", () => {
    const d = makeDelta(0, 0, true);
    expect(d).toMatchObject({ changePercent: 0, direction: "flat", sentiment: "neutral" });
  });

  it("returns null percent when previous is zero but current is not", () => {
    const d = makeDelta(3, 0, true);
    expect(d.changePercent).toBeNull();
    expect(d.sentiment).toBe("bad");
  });
});

describe("computeRangeDates", () => {
  it("builds back-to-back windows for preset ranges", () => {
    const r = computeRangeDates("14d", NOW);
    expect(r.days).toBe(14);
    expect(r.currentEnd.toISOString()).toBe(NOW.toISOString());
    expect(r.currentStart.toISOString()).toBe("2026-05-25T12:00:00.000Z");
    expect(r.previousEnd.getTime()).toBe(r.currentStart.getTime() - 1);
    expect(r.fetchFrom.getTime()).toBe(r.previousStart.getTime());
  });

  it("uses Linear cycle dates in cycle mode", () => {
    const cycle: CycleDates = {
      currentStart: "2026-06-08T00:00:00.000Z",
      currentEnd: "2026-06-22T00:00:00.000Z",
      previousStart: "2026-05-25T00:00:00.000Z",
      previousEnd: "2026-06-08T00:00:00.000Z",
    };
    const r = computeRangeDates("cycle", NOW, cycle);
    expect(r.currentStart.toISOString()).toBe(cycle.currentStart);
    expect(r.currentEnd.toISOString()).toBe(cycle.currentEnd);
    expect(r.previousStart.toISOString()).toBe(cycle.previousStart);
    expect(r.days).toBe(14);
    expect(r.fetchFrom.toISOString()).toBe(cycle.previousStart);
  });

  it("falls back to 14d when cycle dates are missing", () => {
    const r = computeRangeDates("cycle", NOW);
    expect(r.days).toBe(14);
  });
});

function qaseProject(runs: QaseProjectMetrics["runs"]): QaseProjectMetrics {
  return {
    projectCode: "QA",
    projectName: "QA",
    totalCases: 200,
    automatedCases: 100,
    manualCases: 100,
    runs,
  };
}

function run(id: number, startTime: string, total: number, passed: number) {
  return {
    id,
    title: `Run ${id}`,
    projectCode: "QA",
    status: "complete",
    startTime,
    stats: { total, passed, failed: total - passed, skipped: 0, blocked: 0 },
  };
}

describe("computeTrends", () => {
  const curRegression = makeBug({ id: "cur-reg", type: "regression", stateType: "triage", status: "Triage", createdAt: "2026-06-03T10:00:00.000Z" });
  const curReleaseReady = makeBug({ id: "cur-rr", stateType: "started", status: "Release Ready", createdAt: "2026-06-05T10:00:00.000Z" });
  const prevRegression = makeBug({ id: "prev-reg", type: "regression", stateType: "backlog", createdAt: "2026-05-18T10:00:00.000Z" });
  const duplicate = makeBug({ id: "dup", status: "Duplicate", createdAt: "2026-06-04T10:00:00.000Z" });
  // Created BEFORE both windows, resolved inside the current one: 720h to resolve
  const oldResolved = makeBug({
    id: "old-resolved",
    stateType: "completed",
    status: "Done",
    createdAt: "2026-05-05T10:00:00.000Z",
    resolvedAt: "2026-06-04T10:00:00.000Z",
  });

  const bugs = [curRegression, curReleaseReady, prevRegression, duplicate, oldResolved];

  it("counts valid bugs per window and excludes rejected statuses", () => {
    const t = computeTrends("14d", bugs, [], [], NOW);
    expect(t.bugs.current).toBe(2); // cur-reg + cur-rr (duplicate excluded, old-resolved outside window)
    expect(t.bugs.previous).toBe(1); // prev-reg
    expect(t.regressions.current).toBe(1);
    expect(t.regressions.previous).toBe(1);
  });

  it("computes classification deltas with the classification scope (open-only, release-ready excluded)", () => {
    const t = computeTrends("14d", bugs, [], [], NOW);
    expect(t.classification.regressions.current).toBe(1);
    expect(t.classification.unknown.current).toBe(0); // cur-rr is Release Ready → excluded
    expect(t.classification.regressions.previous).toBe(1);
  });

  it("computes MTTR from bugs resolved in the window, not created in it", () => {
    const t = computeTrends("14d", bugs, [], [], NOW);
    expect(t.mttr.current).toBe(720); // old-resolved: 30 days
    expect(t.mttr.previous).toBe(0);
  });

  it("weights pass rate by test count", () => {
    const projects = [qaseProject([
      run(1, "2026-06-02T10:00:00.000Z", 100, 90),
      run(2, "2026-06-03T10:00:00.000Z", 10, 0),
      run(3, "2026-05-20T10:00:00.000Z", 50, 50),
    ])];
    const t = computeTrends("14d", [], [], projects, NOW);
    expect(t.passRate.current).toBe(82); // 90/110, not avg(90%, 0%) = 45
    expect(t.passRate.previous).toBe(100);
  });

  it("produces one time-series point per day of the window", () => {
    const t = computeTrends("14d", bugs, [], [], NOW);
    expect(t.timeSeries).toHaveLength(14);
    const total = t.timeSeries.reduce((s, p) => s + p.bugs, 0);
    expect(total).toBe(2);
    expect(t.timeSeries.at(-1)?.cumulativeBugs).toBe(2);
  });
});
