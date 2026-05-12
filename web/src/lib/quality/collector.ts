import type {
  DashboardData,
  DashboardWithTrends,
  BugMetrics,
  IncidentMetrics,
  AutomationMetrics,
  LinearBug,
  IncidentRecord,
  QaseProjectMetrics,
  VerticalStats,
  TeamStats,
  ProgressEvent,
  RangePreset,
} from "../types";
import { fetchLinearBugs, isOpen, isTriage } from "../integrations/linear";
import { fetchIncidents } from "../integrations/incident";
import { fetchQaseMetrics } from "../integrations/qase";
import {
  getCachedSource,
  setCachedSource,
  isSourceFresh,
  hasAnyStaleSources,
  getOldestFetchedAt,
  clearAllCache,
} from "../cache/source-cache";

function emptyTeamStats(teamKey: string): TeamStats {
  return { total: 0, triage: 0, open: 0, regression: 0, progression: 0, teamKey };
}

function computeBugMetrics(bugs: LinearBug[]): BugMetrics {
  const closed = bugs.filter((b) => b.stateType === "completed" || b.stateType === "canceled");
  const openBugs = bugs.filter(isOpen);
  const triageBugs = bugs.filter(isTriage);

  const byTeam: BugMetrics["byTeam"] = {};
  const byVertical: Record<string, VerticalStats> = {};

  for (const bug of bugs) {
    const bugOpen = isOpen(bug);
    const bugTriage = isTriage(bug);

    if (!byTeam[bug.team]) byTeam[bug.team] = emptyTeamStats(bug.teamKey);
    byTeam[bug.team].total++;
    if (bugTriage) byTeam[bug.team].triage++;
    if (bugOpen) byTeam[bug.team].open++;
    if (bug.type === "regression") byTeam[bug.team].regression++;
    if (bug.type === "progression") byTeam[bug.team].progression++;

    const v = bug.vertical;
    if (!byVertical[v]) byVertical[v] = { total: 0, triage: 0, open: 0, regression: 0, progression: 0, subteams: {} };
    byVertical[v].total++;
    if (bugTriage) byVertical[v].triage++;
    if (bugOpen) byVertical[v].open++;
    if (bug.type === "regression") byVertical[v].regression++;
    if (bug.type === "progression") byVertical[v].progression++;

    const sub = bug.subteam || "(main)";
    if (!byVertical[v].subteams[sub]) byVertical[v].subteams[sub] = emptyTeamStats(bug.teamKey);
    byVertical[v].subteams[sub].total++;
    if (bugTriage) byVertical[v].subteams[sub].triage++;
    if (bugOpen) byVertical[v].subteams[sub].open++;
    if (bug.type === "regression") byVertical[v].subteams[sub].regression++;
    if (bug.type === "progression") byVertical[v].subteams[sub].progression++;
  }

  const byEnvironment: Record<string, number> = {};
  for (const bug of bugs) {
    byEnvironment[bug.environment] = (byEnvironment[bug.environment] ?? 0) + 1;
  }

  const bySeverity: Record<string, number> = {};
  for (const bug of bugs) {
    bySeverity[bug.severity] = (bySeverity[bug.severity] ?? 0) + 1;
  }

  const resolvedWithTime = closed.filter((b) => b.resolvedAt);
  let mttr: number | null = null;
  if (resolvedWithTime.length > 0) {
    const totalHours = resolvedWithTime.reduce((sum, b) => {
      const hours = (new Date(b.resolvedAt!).getTime() - new Date(b.createdAt).getTime()) / 3600000;
      return sum + hours;
    }, 0);
    mttr = Math.round(totalHours / resolvedWithTime.length);
  }

  return {
    total: bugs.length,
    triage: triageBugs.length,
    open: openBugs.length,
    closed: closed.length,
    byTeam,
    byVertical,
    byType: {
      regression: bugs.filter((b) => b.type === "regression").length,
      progression: bugs.filter((b) => b.type === "progression").length,
      unknown: bugs.filter((b) => b.type === "unknown").length,
    },
    byEnvironment,
    bySeverity,
    mttr,
    bugs,
  };
}

function computeIncidentMetrics(incidents: IncidentRecord[]): IncidentMetrics {
  const resolved = incidents.filter((i) => i.resolvedAt);
  const open = incidents.filter((i) => !i.resolvedAt);

  const bySeverity: Record<string, number> = {};
  for (const inc of incidents) {
    bySeverity[inc.severity] = (bySeverity[inc.severity] ?? 0) + 1;
  }

  let mttr: number | null = null;
  const withDuration = incidents.filter((i) => i.durationMinutes != null);
  if (withDuration.length > 0) {
    mttr = Math.round(withDuration.reduce((s, i) => s + i.durationMinutes!, 0) / withDuration.length);
  }

  return {
    total: incidents.length,
    open: open.length,
    resolved: resolved.length,
    bySeverity,
    mttr,
    mttd: null,
    incidents,
  };
}

function computeAutomationMetrics(projects: QaseProjectMetrics[]): AutomationMetrics {
  const totalCases = projects.reduce((s, p) => s + p.totalCases, 0);
  const automatedCases = projects.reduce((s, p) => s + p.automatedCases, 0);
  const manualCases = projects.reduce((s, p) => s + p.manualCases, 0);
  const coveragePercent = totalCases > 0 ? Math.round((automatedCases / totalCases) * 100) : 0;

  const allRuns = projects.flatMap((p) => p.runs).filter((r) => r.status === "complete");
  const totalRuns = allRuns.length;

  let averagePassRate = 0;
  if (allRuns.length > 0) {
    const rates = allRuns.map((r) => (r.stats.total > 0 ? (r.stats.passed / r.stats.total) * 100 : 0));
    averagePassRate = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
  }

  return { totalCases, automatedCases, manualCases, coveragePercent, averagePassRate, totalRuns, projects };
}

export interface CollectorConfig {
  linearApiKey: string;
  incidentApiKey: string | null;
  qaseApiKey: string;
  qaseProjectCodes: string[];
  excludeTeams: string[];
  allIssuesTeams: string[];
  periodDays: number;
}

// ── In-memory cache (same-process fast path) ──

interface RawCache {
  bugs: LinearBug[];
  incidents: IncidentRecord[];
  qase: QaseProjectMetrics[];
  ts: number;
}

let _rawCache: RawCache | null = null;
let _inflight: Promise<RawCache> | null = null;
const MEMORY_TTL = 5 * 60 * 1000;
const WIDE_FETCH_DAYS = 180;

// ── SQLite helpers ──

function loadFromSqlite(excludeTeams: Set<string>): RawCache | null {
  try {
    const linearCached = getCachedSource("linear");
    const qaseCached = getCachedSource("qase");
    if (!linearCached || !qaseCached) return null;

    const incidentCached = getCachedSource("incident");

    let bugs: LinearBug[] = JSON.parse(linearCached.data);
    if (excludeTeams.size > 0) {
      bugs = bugs.filter((b) => !excludeTeams.has(b.team.toLowerCase()) && !excludeTeams.has(b.vertical.toLowerCase()));
    }

    return {
      bugs,
      incidents: incidentCached ? JSON.parse(incidentCached.data) : [],
      qase: JSON.parse(qaseCached.data),
      ts: Math.min(linearCached.fetchedAt, qaseCached.fetchedAt),
    };
  } catch {
    return null;
  }
}

function saveToSqlite(bugs: LinearBug[], incidents: IncidentRecord[], qase: QaseProjectMetrics[]): void {
  try {
    setCachedSource("linear", JSON.stringify(bugs));
    setCachedSource("incident", JSON.stringify(incidents));
    setCachedSource("qase", JSON.stringify(qase));
  } catch {
    // Cache is a performance optimization — don't fail the request
  }
}

// ── Background refresh (single-flight) ──

let _bgRefresh: Promise<void> | null = null;

function refreshInBackground(config: CollectorConfig): void {
  if (_bgRefresh) return;

  _bgRefresh = (async () => {
    try {
      const fetchFrom = new Date();
      fetchFrom.setDate(fetchFrom.getDate() - WIDE_FETCH_DAYS);
      const sinceDate = fetchFrom.toISOString();

      const [rawBugs, rawIncidents, rawQase] = await Promise.all([
        !isSourceFresh("linear")
          ? fetchLinearBugs(config.linearApiKey, sinceDate, { allIssuesTeams: config.allIssuesTeams })
          : Promise.resolve(null),
        !isSourceFresh("incident") && config.incidentApiKey
          ? fetchIncidents(config.incidentApiKey, sinceDate)
          : Promise.resolve(null),
        !isSourceFresh("qase")
          ? fetchQaseMetrics(config.qaseApiKey, config.qaseProjectCodes).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (rawBugs) setCachedSource("linear", JSON.stringify(rawBugs));
      if (rawIncidents) setCachedSource("incident", JSON.stringify(rawIncidents));
      if (rawQase) setCachedSource("qase", JSON.stringify(rawQase));

      const exclude = new Set(config.excludeTeams.map((t) => t.toLowerCase()));
      const bugs = rawBugs
        ? (exclude.size > 0 ? rawBugs.filter((b) => !exclude.has(b.team.toLowerCase()) && !exclude.has(b.vertical.toLowerCase())) : rawBugs)
        : _rawCache?.bugs ?? [];
      const incidents = rawIncidents ?? _rawCache?.incidents ?? [];
      const qase = rawQase ?? _rawCache?.qase ?? [];

      _rawCache = { bugs, incidents, qase, ts: Date.now() };
    } catch {
      // Background refresh failure is non-fatal
    } finally {
      _bgRefresh = null;
    }
  })();
}

// ── Core fetch ──

async function fetchRaw(config: CollectorConfig): Promise<RawCache> {
  if (_rawCache && Date.now() - _rawCache.ts < MEMORY_TTL) return _rawCache;

  const exclude = new Set(config.excludeTeams.map((t) => t.toLowerCase()));
  const sqliteRaw = loadFromSqlite(exclude);
  if (sqliteRaw) {
    _rawCache = sqliteRaw;
    if (hasAnyStaleSources()) refreshInBackground(config);
    return sqliteRaw;
  }

  if (_inflight) return _inflight;

  _inflight = (async () => {
    const fetchFrom = new Date();
    fetchFrom.setDate(fetchFrom.getDate() - WIDE_FETCH_DAYS);

    const [rawBugsAll, rawIncidents, rawQase] = await Promise.all([
      fetchLinearBugs(config.linearApiKey, fetchFrom.toISOString(), {
        allIssuesTeams: config.allIssuesTeams,
      }),
      config.incidentApiKey
        ? fetchIncidents(config.incidentApiKey, fetchFrom.toISOString())
        : Promise.resolve([]),
      fetchQaseMetrics(config.qaseApiKey, config.qaseProjectCodes).catch(() => [] as QaseProjectMetrics[]),
    ]);

    saveToSqlite(rawBugsAll, rawIncidents, rawQase);

    const bugs = exclude.size > 0
      ? rawBugsAll.filter((b) => !exclude.has(b.team.toLowerCase()) && !exclude.has(b.vertical.toLowerCase()))
      : rawBugsAll;

    const result: RawCache = { bugs, incidents: rawIncidents, qase: rawQase, ts: Date.now() };
    _rawCache = result;
    _inflight = null;
    return result;
  })();

  return _inflight;
}

function buildDashboardData(raw: RawCache, periodDays: number): DashboardData {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  const bugs = raw.bugs.filter((b) => new Date(b.createdAt) >= startDate);
  const incidents = raw.incidents.filter((i) => new Date(i.createdAt) >= startDate);

  return {
    generatedAt: endDate.toISOString(),
    period: {
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
    },
    bugs: computeBugMetrics(bugs),
    incidents: computeIncidentMetrics(incidents),
    automation: computeAutomationMetrics(raw.qase),
  };
}

const RANGE_DAYS: Record<RangePreset, number> = { "7d": 7, "14d": 14, "30d": 30, quarter: 90 };

export async function collectDashboardData(config: CollectorConfig): Promise<DashboardData> {
  const raw = await fetchRaw(config);
  return buildDashboardData(raw, config.periodDays);
}

export async function collectWithTrends(
  config: CollectorConfig,
  range: RangePreset,
): Promise<DashboardWithTrends> {
  const { computeTrends } = await import("./trends");
  const raw = await fetchRaw(config);
  const data = buildDashboardData(raw, RANGE_DAYS[range]);
  const trends = computeTrends(range, raw.bugs, raw.incidents, raw.qase);
  const oldest = getOldestFetchedAt();
  return { data, trends, cachedAt: oldest ? new Date(oldest).toISOString() : undefined };
}

export function invalidateCache() {
  _rawCache = null;
  clearAllCache();
}

export async function collectWithProgress(
  config: CollectorConfig,
  range: RangePreset,
  onProgress: (evt: ProgressEvent) => void,
): Promise<DashboardWithTrends> {
  // 1. In-memory cache hit
  if (_rawCache && Date.now() - _rawCache.ts < MEMORY_TTL) {
    onProgress({ source: "linear", status: "done", detail: `${_rawCache.bugs.length} bugs (cached)` });
    onProgress({ source: "incident", status: _rawCache.incidents.length > 0 ? "done" : "skipped", detail: _rawCache.incidents.length > 0 ? `${_rawCache.incidents.length} incidents (cached)` : "No API key" });
    onProgress({ source: "qase", status: "done", detail: `${_rawCache.qase.length} projects (cached)` });
    onProgress({ source: "processing", status: "done", detail: "Cached" });
    return collectWithTrends(config, range);
  }

  // 2. SQLite cache hit — stale-while-revalidate
  const exclude = new Set(config.excludeTeams.map((t) => t.toLowerCase()));
  const sqliteRaw = loadFromSqlite(exclude);
  if (sqliteRaw) {
    _rawCache = sqliteRaw;
    onProgress({ source: "linear", status: "done", detail: `${sqliteRaw.bugs.length} bugs (cached)` });
    onProgress({ source: "incident", status: sqliteRaw.incidents.length > 0 ? "done" : "skipped", detail: sqliteRaw.incidents.length > 0 ? `${sqliteRaw.incidents.length} incidents (cached)` : "No API key" });
    onProgress({ source: "qase", status: "done", detail: `${sqliteRaw.qase.length} projects (cached)` });
    onProgress({ source: "processing", status: "done", detail: "Cached" });

    const { computeTrends } = await import("./trends");
    const data = buildDashboardData(sqliteRaw, RANGE_DAYS[range]);
    const trends = computeTrends(range, sqliteRaw.bugs, sqliteRaw.incidents, sqliteRaw.qase);

    if (hasAnyStaleSources()) refreshInBackground(config);

    const oldest = getOldestFetchedAt();
    return { data, trends, cachedAt: oldest ? new Date(oldest).toISOString() : undefined };
  }

  // 3. Cold start — full fetch with progress
  const fetchFrom = new Date();
  fetchFrom.setDate(fetchFrom.getDate() - WIDE_FETCH_DAYS);
  const sinceDate = fetchFrom.toISOString();

  onProgress({ source: "linear", status: "loading" });
  onProgress({ source: "incident", status: config.incidentApiKey ? "waiting" : "skipped", detail: config.incidentApiKey ? undefined : "No API key" });
  onProgress({ source: "qase", status: "waiting" });
  onProgress({ source: "processing", status: "waiting" });

  const linearPromise = fetchLinearBugs(config.linearApiKey, sinceDate, {
    allIssuesTeams: config.allIssuesTeams,
  }).then((r) => {
    onProgress({ source: "linear", status: "done", detail: `${r.length} bugs` });
    return r;
  }).catch((e) => {
    onProgress({ source: "linear", status: "error", detail: e.message });
    return [] as LinearBug[];
  });

  const incidentPromise = config.incidentApiKey
    ? (() => {
        onProgress({ source: "incident", status: "loading" });
        return fetchIncidents(config.incidentApiKey!, sinceDate).then((r) => {
          onProgress({ source: "incident", status: "done", detail: `${r.length} incidents` });
          return r;
        }).catch((e) => {
          onProgress({ source: "incident", status: "error", detail: e.message });
          return [] as IncidentRecord[];
        });
      })()
    : Promise.resolve([] as IncidentRecord[]);

  const qasePromise = (() => {
    onProgress({ source: "qase", status: "loading" });
    return fetchQaseMetrics(config.qaseApiKey, config.qaseProjectCodes).then((r) => {
      onProgress({ source: "qase", status: "done", detail: `${r.length} projects` });
      return r;
    }).catch((e) => {
      onProgress({ source: "qase", status: "error", detail: e.message });
      return [] as QaseProjectMetrics[];
    });
  })();

  const [rawBugsAll, rawIncidents, rawQase] = await Promise.all([linearPromise, incidentPromise, qasePromise]);

  onProgress({ source: "processing", status: "loading" });

  saveToSqlite(rawBugsAll, rawIncidents, rawQase);

  const bugs = exclude.size > 0
    ? rawBugsAll.filter((b) => !exclude.has(b.team.toLowerCase()) && !exclude.has(b.vertical.toLowerCase()))
    : rawBugsAll;

  _rawCache = { bugs, incidents: rawIncidents, qase: rawQase, ts: Date.now() };

  const { computeTrends } = await import("./trends");
  const data = buildDashboardData(_rawCache, RANGE_DAYS[range]);
  const trends = computeTrends(range, bugs, rawIncidents, rawQase);

  onProgress({ source: "processing", status: "done", detail: "Ready" });

  return { data, trends, cachedAt: new Date().toISOString() };
}
