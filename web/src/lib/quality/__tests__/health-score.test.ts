import { describe, it, expect } from "vitest";
import { computeBugAging, normalizeSev, scoreToGrade, computeIncidentSeverityScore } from "../health-score";
import { makeBug } from "../../__tests__/fixtures";
import type { IncidentRecord } from "../../types";

const NOW = new Date("2026-06-08T12:00:00.000Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

describe("computeBugAging", () => {
  it("buckets open bugs by age and ignores closed bugs", () => {
    const bugs = [
      makeBug({ id: "a", createdAt: daysAgo(3) }),    // fresh
      makeBug({ id: "b", createdAt: daysAgo(10) }),   // recent
      makeBug({ id: "c", createdAt: daysAgo(45) }),   // aging
      makeBug({ id: "d", createdAt: daysAgo(70) }),   // stale
      makeBug({ id: "e", createdAt: daysAgo(120) }),  // critical
      makeBug({ id: "f", createdAt: daysAgo(120), stateType: "completed", status: "Done" }),
    ];
    expect(computeBugAging(bugs, NOW)).toEqual({
      fresh: 1, recent: 1, aging: 1, stale: 1, critical: 1, total: 5,
    });
  });
});

describe("normalizeSev", () => {
  it("normalizes common severity spellings", () => {
    expect(normalizeSev("SEV-1")).toBe("SEV-1");
    expect(normalizeSev("sev-2: Major outage")).toBe("SEV-2");
    expect(normalizeSev("Sev 3")).toBe("SEV-3");
    expect(normalizeSev("SEV_1")).toBe("SEV-1");
    expect(normalizeSev("sev1")).toBe("SEV-1");
  });

  it("returns Other for unknown severities", () => {
    expect(normalizeSev("critical")).toBe("Other");
    expect(normalizeSev("")).toBe("Other");
  });
});

describe("scoreToGrade", () => {
  it("maps score boundaries to grades", () => {
    expect(scoreToGrade(80)).toBe("A");
    expect(scoreToGrade(79)).toBe("B");
    expect(scoreToGrade(60)).toBe("B");
    expect(scoreToGrade(59)).toBe("C");
    expect(scoreToGrade(40)).toBe("C");
    expect(scoreToGrade(20)).toBe("D");
    expect(scoreToGrade(19)).toBe("E");
  });
});

describe("computeIncidentSeverityScore", () => {
  function incident(severity: string): IncidentRecord {
    return {
      id: "inc-1",
      name: "Incident",
      severity,
      status: "closed",
      createdAt: daysAgo(2),
      url: "https://app.incident.io/x",
    };
  }

  it("weights SEV-1 > SEV-2 > SEV-3 and ignores others", () => {
    expect(computeIncidentSeverityScore([
      incident("SEV-1"), incident("sev-2 partial"), incident("SEV 3"), incident("triage"),
    ])).toBe(16);
  });
});
