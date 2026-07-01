import type {
  LinearBug,
  IncidentRecord,
  AutomationMetrics,
  ServiceHealth,
  HealthScore,
  HealthSubScore,
  BugAgingBuckets,
  BugFlowRow,
  Grade,
  Delta,
  VerticalStats,
  TeamRisk,
  RiskLevel,
  ExecSummary,
  OkrVerticalComparison,
} from "../types";
import { isOpen, isValidBug } from "../integrations/linear";

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

export function normalizeSev(severity: string): string {
  const m = severity.toLowerCase().match(/sev[\s_-]?([123])/);
  if (m) return `SEV-${m[1]}`;
  return "Other";
}

// ── Bug Aging ──

export function computeBugAging(bugs: LinearBug[], now = new Date()): BugAgingBuckets {
  const openBugs = bugs.filter(isOpen);
  const buckets: BugAgingBuckets = { fresh: 0, recent: 0, aging: 0, stale: 0, critical: 0, total: openBugs.length };

  for (const b of openBugs) {
    const days = (now.getTime() - new Date(b.createdAt).getTime()) / 86_400_000;
    if (days < 7) buckets.fresh++;
    else if (days < 30) buckets.recent++;
    else if (days < 60) buckets.aging++;
    else if (days < 90) buckets.stale++;
    else buckets.critical++;
  }

  return buckets;
}

// ── Incident Severity Score ──

export function computeIncidentSeverityScore(incidents: IncidentRecord[]): number {
  let score = 0;
  for (const inc of incidents) {
    const sev = normalizeSev(inc.severity);
    if (sev === "SEV-1") score += 10;
    else if (sev === "SEV-2") score += 5;
    else if (sev === "SEV-3") score += 1;
  }
  return score;
}

// ── Stability sub-score (0-100) ──

function computeStability(bugs: LinearBug[], incidents: IncidentRecord[], serviceHealth: ServiceHealth | null): HealthSubScore {
  const prodBugs = bugs.filter((b) => b.environment === "Production");
  // Denominator excludes env-unclassified bugs so unlabeled tickets don't dilute the rate
  const envClassified = bugs.filter((b) => b.environment !== "Unclassified");
  const escapedRate = envClassified.length > 0 ? (prodBugs.length / envClassified.length) * 100 : 0;
  const incidentPenalty = computeIncidentSeverityScore(incidents);

  const incidentScore = clamp(100 - incidentPenalty * 3);
  const escapedScore = clamp(100 - escapedRate * 1.5);

  if (serviceHealth) {
    const apdexScore = clamp(serviceHealth.overallApdex * 100);
    const errorRateScore = clamp(100 - serviceHealth.overallErrorRate * 20);
    const gqlHealthScore = clamp(100 - serviceHealth.graphqlErrorRate * 10);

    const crashRates = [serviceHealth.iosCrashFreeRate, serviceHealth.androidCrashFreeRate].filter((r): r is number => r !== null);
    const hasMobile = crashRates.length > 0;
    const mobileCrashScore = hasMobile ? clamp(crashRates.reduce((a, b) => a + b, 0) / crashRates.length) : 0;

    const score = hasMobile
      ? Math.round(
          incidentScore * 0.15 + escapedScore * 0.15 +
          apdexScore * 0.20 + errorRateScore * 0.10 + gqlHealthScore * 0.20 +
          mobileCrashScore * 0.20,
        )
      : Math.round(
          incidentScore * 0.20 + escapedScore * 0.20 +
          apdexScore * 0.20 + errorRateScore * 0.15 + gqlHealthScore * 0.25,
        );

    const components: Record<string, number> = {
      incidentScore: Math.round(incidentScore),
      escapedDefectScore: Math.round(escapedScore),
      apdexScore: Math.round(apdexScore),
      errorRateScore: Math.round(errorRateScore),
      gqlHealthScore: Math.round(gqlHealthScore),
      overallApdex: serviceHealth.overallApdex,
      overallErrorRate: serviceHealth.overallErrorRate,
      graphqlErrorRate: serviceHealth.graphqlErrorRate,
      productionIncidents: incidents.length,
      escapedDefectRate: Math.round(escapedRate),
    };
    if (hasMobile) components.mobileCrashScore = Math.round(mobileCrashScore);

    return { score, weight: 0.35, components };
  }

  return {
    score: Math.round((incidentScore + escapedScore) / 2),
    weight: 0.35,
    components: {
      incidentScore: Math.round(incidentScore),
      escapedDefectScore: Math.round(escapedScore),
      productionIncidents: incidents.length,
      escapedDefectRate: Math.round(escapedRate),
    },
  };
}

// ── Reliability sub-score (0-100) ──

function computeReliability(bugs: LinearBug[], now = new Date()): HealthSubScore {
  const resolved = bugs.filter((b) => b.resolvedAt);
  let mttrHours = 0;
  if (resolved.length > 0) {
    mttrHours = resolved.reduce(
      (s, b) => s + (new Date(b.resolvedAt!).getTime() - new Date(b.createdAt).getTime()) / 3_600_000,
      0,
    ) / resolved.length;
  }

  let mttrScore: number;
  if (mttrHours <= 24) mttrScore = 100;
  else if (mttrHours <= 48) mttrScore = 75;
  else if (mttrHours <= 72) mttrScore = 50;
  else if (mttrHours <= 168) mttrScore = 25;
  else mttrScore = 0;

  const aging = computeBugAging(bugs, now);
  const openBugs = aging.total;
  let agingScore = 100;
  if (openBugs > 0) {
    agingScore = clamp(
      100 - ((aging.aging / openBugs) * 30 + (aging.stale / openBugs) * 40 + (aging.critical / openBugs) * 30) * 100,
    );
  }

  return {
    score: Math.round(mttrScore * 0.5 + agingScore * 0.5),
    weight: 0.25,
    components: {
      mttrScore: Math.round(mttrScore),
      agingScore: Math.round(agingScore),
      mttrHours: Math.round(mttrHours),
      bugsOver30d: aging.aging + aging.stale + aging.critical,
    },
  };
}

// ── Prevention sub-score (0-100) ──

function computePrevention(automation: AutomationMetrics): HealthSubScore {
  const coverageScore = clamp(automation.coveragePercent);
  const passRateScore = clamp(automation.averagePassRate);

  return {
    score: Math.round((coverageScore + passRateScore) / 2),
    weight: 0.20,
    components: {
      coverageScore: Math.round(coverageScore),
      passRateScore: Math.round(passRateScore),
      automationCoverage: automation.coveragePercent,
      averagePassRate: automation.averagePassRate,
    },
  };
}

// ── Delivery sub-score (0-100) ──

function computeDelivery(bugs: LinearBug[]): HealthSubScore {
  const total = bugs.length || 1;
  const regressions = bugs.filter((b) => b.type === "regression").length;
  const regressionRate = (regressions / total) * 100;
  const regressionScore = clamp(100 - regressionRate * 2);

  const openCriticals = bugs.filter((b) => isOpen(b) && b.severity === "Critical").length;
  const criticalScore = clamp(100 - openCriticals * 20);

  return {
    score: Math.round((regressionScore + criticalScore) / 2),
    weight: 0.20,
    components: {
      regressionScore: Math.round(regressionScore),
      criticalScore: Math.round(criticalScore),
      regressionRate: Math.round(regressionRate),
      openCriticals,
    },
  };
}

// ── Composite Health Score ──

export function scoreToGrade(score: number): Grade {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "E";
}

export function computeHealthScore(
  bugs: LinearBug[],
  incidents: IncidentRecord[],
  automation: AutomationMetrics,
  serviceHealth: ServiceHealth | null = null,
  now = new Date(),
): HealthScore {
  const stability = computeStability(bugs, incidents, serviceHealth);
  const reliability = computeReliability(bugs, now);
  const prevention = computePrevention(automation);
  const delivery = computeDelivery(bugs);

  const overall = Math.round(
    stability.score * stability.weight +
    reliability.score * reliability.weight +
    prevention.score * prevention.weight +
    delivery.score * delivery.weight,
  );

  return {
    overall,
    grade: scoreToGrade(overall),
    stability,
    reliability,
    prevention,
    delivery,
  };
}

// ── Team Risk Assessment ──

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function computeTeamRisks(
  byVertical: Record<string, VerticalStats>,
  bugs: LinearBug[],
  verticalTrends: Array<{ name: string; bugs: Delta; regressions: Delta }>,
  now = new Date(),
): TeamRisk[] {
  return Object.entries(byVertical).map(([name, stats]) => {
    const teamBugs = bugs.filter((b) => b.vertical === name);
    const aging = computeBugAging(teamBugs, now);
    const openCriticals = teamBugs.filter((b) => isOpen(b) && b.severity === "Critical").length;
    const regressionRate = stats.total > 0 ? Math.round((stats.regression / stats.total) * 100) : 0;

    const trend = verticalTrends.find((t) => t.name === name);
    const bugsDelta = trend?.bugs ?? { current: 0, previous: 0, change: 0, changePercent: 0, direction: "flat" as const, sentiment: "neutral" as const };

    const signals: string[] = [];
    let riskPoints = 0;

    if (openCriticals > 0) {
      signals.push(`${openCriticals} critical bug${openCriticals > 1 ? "s" : ""} open`);
      riskPoints += openCriticals * 15;
    }
    if (regressionRate > 30) {
      signals.push(`${regressionRate}% regression rate`);
      riskPoints += 20;
    } else if (regressionRate > 15) {
      signals.push(`${regressionRate}% regression rate`);
      riskPoints += 10;
    }
    if (aging.aging + aging.stale + aging.critical > 3) {
      signals.push(`${aging.aging + aging.stale + aging.critical} bugs aging > 30d`);
      riskPoints += 15;
    }
    if (bugsDelta.sentiment === "bad" && bugsDelta.changePercent !== null && bugsDelta.changePercent > 30) {
      signals.push(`Bug volume +${bugsDelta.changePercent}% vs prior`);
      riskPoints += 15;
    }
    if (stats.open > 10) {
      signals.push(`${stats.open} bugs open`);
      riskPoints += 10;
    }

    const riskScore = clamp(riskPoints, 0, 100);
    let level: RiskLevel;
    if (riskScore >= 50) level = "critical";
    else if (riskScore >= 30) level = "high";
    else if (riskScore >= 15) level = "watch";
    else if (bugsDelta.sentiment === "good" && bugsDelta.changePercent !== null && Math.abs(bugsDelta.changePercent) > 10) level = "improving";
    else level = "stable";

    return {
      name,
      slug: slugify(name),
      level,
      score: riskScore,
      signals,
      teamKey: stats.subteams["(main)"]?.teamKey ?? Object.values(stats.subteams)[0]?.teamKey ?? "",
      stats,
      bugsDelta,
      regressionRate,
      aging,
      openCriticals,
    };
  }).sort((a, b) => b.score - a.score);
}

// ── OKR key results: Q2 vs Q1 2026 per-vertical comparisons ──

const OKR_EXCLUDED_VERTICALS = new Set([
  "qa", "tlc operations", "android", "robots", "cortex",
  "collect app", "scan tech", "data engineering", "design team", "design", "pricing", "price index",
]);

const OKR_Q1_START = new Date("2026-01-01T00:00:00.000Z");
const OKR_Q2_START = new Date("2026-04-01T00:00:00.000Z");
const OKR_Q2_END = new Date("2026-07-01T00:00:00.000Z");

function pctChange(prev: number, curr: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

// Counts bugs matching `predicate` per vertical for calendar Q1 vs Q2 2026,
// excluding canceled/triage/invalid statuses and non-product verticals.
function computeOkrVerticalComparison(allBugs: LinearBug[], predicate: (b: LinearBug) => boolean): OkrVerticalComparison {
  const matched = allBugs.filter((b) => isValidBug(b) && b.stateType !== "triage" && predicate(b));

  const byV: Record<string, { q1: number; q2: number; q2Bugs: LinearBug[] }> = {};
  let q1Total = 0;
  let q2Total = 0;

  for (const b of matched) {
    if (OKR_EXCLUDED_VERTICALS.has(b.vertical.toLowerCase())) continue;
    const created = new Date(b.createdAt);
    const entry = (byV[b.vertical] ??= { q1: 0, q2: 0, q2Bugs: [] });
    if (created >= OKR_Q1_START && created < OKR_Q2_START) {
      entry.q1++;
      q1Total++;
    } else if (created >= OKR_Q2_START && created < OKR_Q2_END) {
      entry.q2++;
      q2Total++;
      entry.q2Bugs.push(b);
    }
  }

  const byVertical = Object.entries(byV)
    .map(([vertical, { q1, q2, q2Bugs }]) => ({ vertical, q1, q2, changePercent: pctChange(q1, q2), q2Bugs }))
    .filter((r) => r.q1 > 0 || r.q2 > 0)
    .sort((a, b) => b.q1 - a.q1 || b.q2 - a.q2);

  return { q1Total, q2Total, changePercent: pctChange(q1Total, q2Total), byVertical };
}

export function computeKr1ProdDefects(allBugs: LinearBug[]): OkrVerticalComparison {
  return computeOkrVerticalComparison(allBugs, (b) => b.environment === "Production");
}

export function computeKr2ReleaseBlockers(allBugs: LinearBug[]): OkrVerticalComparison {
  return computeOkrVerticalComparison(allBugs, (b) => b.releaseBlocker === true);
}

// ── Executive Summary (combines everything) ──

export function computeExecSummary(
  bugs: LinearBug[],
  incidents: IncidentRecord[],
  automation: AutomationMetrics,
  byVertical: Record<string, VerticalStats>,
  verticalTrends: Array<{ name: string; bugs: Delta; regressions: Delta }>,
  serviceHealth: ServiceHealth | null = null,
  allBugs: LinearBug[] = bugs,
  periodStart?: Date,
  periodEnd?: Date,
  now = new Date(),
): ExecSummary {
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const validBugs = bugs.filter((b) => isValidBug(b) && new Date(b.createdAt) >= sixMonthsAgo);
  const validAllBugs = allBugs.filter((b) => isValidBug(b) && new Date(b.createdAt) >= sixMonthsAgo);

  const validByVertical: Record<string, VerticalStats> = {};
  for (const b of validBugs) {
    const v = b.vertical;
    if (!validByVertical[v]) validByVertical[v] = { total: 0, triage: 0, open: 0, regression: 0, progression: 0, subteams: {} };
    validByVertical[v].total++;
    if (b.stateType === "triage") validByVertical[v].triage++;
    if (isOpen(b)) validByVertical[v].open++;
    if (b.type === "regression") validByVertical[v].regression++;
    if (b.type === "progression") validByVertical[v].progression++;
    const sub = b.subteam || "(main)";
    if (!validByVertical[v].subteams[sub]) validByVertical[v].subteams[sub] = { total: 0, triage: 0, open: 0, regression: 0, progression: 0, teamKey: b.teamKey };
    validByVertical[v].subteams[sub].total++;
    if (b.stateType === "triage") validByVertical[v].subteams[sub].triage++;
    if (isOpen(b)) validByVertical[v].subteams[sub].open++;
    if (b.type === "regression") validByVertical[v].subteams[sub].regression++;
    if (b.type === "progression") validByVertical[v].subteams[sub].progression++;
  }

  const healthScore = computeHealthScore(validBugs, incidents, automation, serviceHealth, now);
  const prodBugs = validBugs.filter((b) => b.environment === "Production").length;
  const customerBugs = validBugs.filter((b) =>
    b.type !== "unknown" && b.environment === "Production",
  ).length;
  const openCriticalsList = validBugs.filter((b) => isOpen(b) && b.severity === "Critical");
  const openCriticals = openCriticalsList.length;
  const regressionRate = validBugs.length > 0 ? Math.round((validBugs.filter((b) => b.type === "regression").length / validBugs.length) * 100) : 0;
  const envClassifiedCount = validBugs.filter((b) => b.environment !== "Unclassified").length;
  const escapedDefectRate = envClassifiedCount > 0 ? Math.round((prodBugs / envClassifiedCount) * 100) : 0;

  const regByV: Record<string, { regressions: number; total: number }> = {};
  for (const b of validBugs) {
    const entry = regByV[b.vertical] ??= { regressions: 0, total: 0 };
    entry.total++;
    if (b.type === "regression") entry.regressions++;
  }
  const regressionsByVertical = Object.entries(regByV)
    .map(([vertical, { regressions, total }]) => ({
      vertical,
      regressions,
      total,
      rate: total > 0 ? Math.round((regressions / total) * 100) : 0,
    }))
    .sort((a, b) => b.regressions - a.regressions);

  const incidentsBySeverity: Record<string, number> = {};
  for (const inc of incidents) {
    const sev = normalizeSev(inc.severity);
    incidentsBySeverity[sev] = (incidentsBySeverity[sev] ?? 0) + 1;
  }

  const prodBugsList = validBugs.filter((b) => b.environment === "Production");
  const prodBugsByVertical: Record<string, number> = {};
  for (const b of prodBugsList) {
    prodBugsByVertical[b.vertical] = (prodBugsByVertical[b.vertical] ?? 0) + 1;
  }

  const pStart = periodStart ?? now;
  const pEnd = periodEnd ?? now;
  const createdInPeriod = validBugs;
  const closedInPeriod = validAllBugs.filter((b) =>
    b.resolvedAt && new Date(b.resolvedAt) >= pStart && new Date(b.resolvedAt) <= pEnd,
  );

  const flowVerticals = new Set<string>();
  const createdByV: Record<string, number> = {};
  const closedByV: Record<string, number> = {};
  for (const b of createdInPeriod) {
    flowVerticals.add(b.vertical);
    createdByV[b.vertical] = (createdByV[b.vertical] ?? 0) + 1;
  }
  for (const b of closedInPeriod) {
    flowVerticals.add(b.vertical);
    closedByV[b.vertical] = (closedByV[b.vertical] ?? 0) + 1;
  }
  const byVerticalFlow: BugFlowRow[] = [...flowVerticals]
    .map((v) => ({
      vertical: v,
      created: createdByV[v] ?? 0,
      closed: closedByV[v] ?? 0,
      delta: (createdByV[v] ?? 0) - (closedByV[v] ?? 0),
    }))
    .sort((a, b) => b.delta - a.delta);

  const totalCreated = createdInPeriod.length;
  const totalClosed = closedInPeriod.length;
  const bugFlow = {
    created: totalCreated,
    closed: totalClosed,
    delta: totalCreated - totalClosed,
    byVertical: byVerticalFlow,
  };

  // ── Pipeline (non-prod) metrics for Delivery Health ──
  const nonProdBugs = validBugs.filter((b) => b.environment !== "Production");
  const nonProdAll = validAllBugs.filter((b) => b.environment !== "Production");

  const pipelineRegressions = nonProdBugs.filter((b) => b.type === "regression").length;
  const pipelineRegressionRate = nonProdBugs.length > 0 ? Math.round((pipelineRegressions / nonProdBugs.length) * 100) : 0;

  const pipeRegByV: Record<string, { regressions: number; total: number }> = {};
  for (const b of nonProdBugs) {
    const entry = pipeRegByV[b.vertical] ??= { regressions: 0, total: 0 };
    entry.total++;
    if (b.type === "regression") entry.regressions++;
  }
  const pipelineRegressionsByVertical = Object.entries(pipeRegByV)
    .map(([vertical, { regressions, total }]) => ({
      vertical,
      regressions,
      total,
      rate: total > 0 ? Math.round((regressions / total) * 100) : 0,
    }))
    .sort((a, b) => b.regressions - a.regressions);

  const ppCreated = nonProdBugs;
  const ppClosed = nonProdAll.filter((b) =>
    b.resolvedAt && new Date(b.resolvedAt) >= pStart && new Date(b.resolvedAt) <= pEnd,
  );
  const ppFlowVerts = new Set<string>();
  const ppCreatedByV: Record<string, number> = {};
  const ppClosedByV: Record<string, number> = {};
  for (const b of ppCreated) { ppFlowVerts.add(b.vertical); ppCreatedByV[b.vertical] = (ppCreatedByV[b.vertical] ?? 0) + 1; }
  for (const b of ppClosed) { ppFlowVerts.add(b.vertical); ppClosedByV[b.vertical] = (ppClosedByV[b.vertical] ?? 0) + 1; }
  const ppByVerticalFlow: BugFlowRow[] = [...ppFlowVerts]
    .map((v) => ({ vertical: v, created: ppCreatedByV[v] ?? 0, closed: ppClosedByV[v] ?? 0, delta: (ppCreatedByV[v] ?? 0) - (ppClosedByV[v] ?? 0) }))
    .sort((a, b) => b.delta - a.delta);
  const preProdBugFlow = { created: ppCreated.length, closed: ppClosed.length, delta: ppCreated.length - ppClosed.length, byVertical: ppByVerticalFlow };

  const preProdBugAging = computeBugAging(nonProdBugs, now);
  const preProdBugAgingList = nonProdBugs.filter(isOpen);

  const automationHealth = { coverage: automation.coveragePercent, passRate: automation.averagePassRate };

  return {
    healthScore,
    escapedDefectRate,
    openCriticals,
    incidentSeverityScore: computeIncidentSeverityScore(incidents),
    incidentsBySeverity,
    regressionRate,
    bugAging: computeBugAging(validBugs, now),
    teamRisks: computeTeamRisks(validByVertical, validBugs, verticalTrends, now),
    customerBugs,
    productionBugs: prodBugs,
    prodBugsByVertical,
    productionBugsList: prodBugsList,
    openCriticalsList,
    regressionsByVertical,
    bugFlow,
    pipelineRegressionRate,
    pipelineRegressionsByVertical,
    preProdBugFlow,
    preProdBugAging,
    preProdBugAgingList,
    automationHealth,
    serviceHealth,
    kr1ProdDefects: computeKr1ProdDefects(allBugs),
    kr2ReleaseBlockers: computeKr2ReleaseBlockers(allBugs),
  };
}
