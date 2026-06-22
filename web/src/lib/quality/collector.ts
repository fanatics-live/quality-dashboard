import type {
  DashboardData,
  DashboardWithTrendsV2,
  BugMetrics,
  IncidentMetrics,
  AutomationMetrics,
  ServiceHealth,
  LinearBug,
  IncidentRecord,
  QaseProjectMetrics,
  CycleDates,
  VerticalStats,
  TeamStats,
  ProgressEvent,
  RangePreset,
  SourceError,
} from "../types";
import { fetchLinearBugs, fetchCycleDates, isOpen, isTriage, isValidBug } from "../integrations/linear";
import { fetchIncidents } from "../integrations/incident";
import { fetchQaseMetrics } from "../integrations/qase";
import { fetchDatadogMetrics, type DatadogConfig, type DatadogMetrics } from "../integrations/datadog";
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

function computeBugMetrics(allBugsRaw: LinearBug[]): BugMetrics {
  const bugs = allBugsRaw.filter(isValidBug);
  const closed = bugs.filter((b) => b.stateType === "completed");
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

  const totalExecuted = allRuns.reduce((s, r) => s + r.stats.total, 0);
  const totalPassed = allRuns.reduce((s, r) => s + r.stats.passed, 0);
  const averagePassRate = totalExecuted > 0 ? Math.round((totalPassed / totalExecuted) * 100) : 0;

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
  datadog: DatadogConfig | null;
}

// ── In-memory cache (same-process fast path) ──

interface RawCache {
  bugs: LinearBug[];
  incidents: IncidentRecord[];
  qase: QaseProjectMetrics[];
  datadog: DatadogMetrics | null;
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
    const datadogCached = getCachedSource("datadog");

    let bugs: LinearBug[] = JSON.parse(linearCached.data);
    if (excludeTeams.size > 0) {
      bugs = bugs.filter((b) => !excludeTeams.has(b.team.toLowerCase()) && !excludeTeams.has(b.vertical.toLowerCase()));
    }

    return {
      bugs,
      incidents: incidentCached ? JSON.parse(incidentCached.data) : [],
      qase: JSON.parse(qaseCached.data),
      datadog: datadogCached ? JSON.parse(datadogCached.data) : null,
      ts: Math.min(linearCached.fetchedAt, qaseCached.fetchedAt),
    };
  } catch {
    return null;
  }
}

function saveToSqlite(bugs: LinearBug[], incidents: IncidentRecord[], qase: QaseProjectMetrics[], datadog: DatadogMetrics | null): void {
  try {
    setCachedSource("linear", JSON.stringify(bugs));
    setCachedSource("incident", JSON.stringify(incidents));
    setCachedSource("qase", JSON.stringify(qase));
    if (datadog) setCachedSource("datadog", JSON.stringify(datadog));
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

      const [rawBugs, rawIncidents, rawQase, rawDatadog] = await Promise.all([
        !isSourceFresh("linear")
          ? fetchLinearBugs(config.linearApiKey, sinceDate, { allIssuesTeams: config.allIssuesTeams })
          : Promise.resolve(null),
        !isSourceFresh("incident") && config.incidentApiKey
          ? fetchIncidents(config.incidentApiKey, sinceDate)
          : Promise.resolve(null),
        !isSourceFresh("qase")
          ? fetchQaseMetrics(config.qaseApiKey, config.qaseProjectCodes).catch((e) => {
              console.error("[collector] background qase refresh failed:", e);
              return null;
            })
          : Promise.resolve(null),
        !isSourceFresh("datadog") && config.datadog
          ? fetchDatadogMetrics(config.datadog, config.periodDays).catch((e) => {
              console.error("[collector] background datadog refresh failed:", e);
              return null;
            })
          : Promise.resolve(null),
      ]);

      if (rawBugs) setCachedSource("linear", JSON.stringify(rawBugs));
      if (rawIncidents) setCachedSource("incident", JSON.stringify(rawIncidents));
      if (rawQase) setCachedSource("qase", JSON.stringify(rawQase));
      if (rawDatadog) setCachedSource("datadog", JSON.stringify(rawDatadog));

      const exclude = new Set(config.excludeTeams.map((t) => t.toLowerCase()));
      const bugs = rawBugs
        ? (exclude.size > 0 ? rawBugs.filter((b) => !exclude.has(b.team.toLowerCase()) && !exclude.has(b.vertical.toLowerCase())) : rawBugs)
        : _rawCache?.bugs ?? [];
      const incidents = rawIncidents ?? _rawCache?.incidents ?? [];
      const qase = rawQase ?? _rawCache?.qase ?? [];
      const datadog = rawDatadog ?? _rawCache?.datadog ?? null;

      _rawCache = { bugs, incidents, qase, datadog, ts: Date.now() };
    } catch (e) {
      // Background refresh failure is non-fatal
      console.error("[collector] background refresh failed:", e);
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

    const [rawBugsAll, rawIncidents, rawQase, rawDatadog] = await Promise.all([
      fetchLinearBugs(config.linearApiKey, fetchFrom.toISOString(), {
        allIssuesTeams: config.allIssuesTeams,
      }),
      config.incidentApiKey
        ? fetchIncidents(config.incidentApiKey, fetchFrom.toISOString())
        : Promise.resolve([]),
      fetchQaseMetrics(config.qaseApiKey, config.qaseProjectCodes).catch((e) => {
        console.error("[collector] qase fetch failed:", e);
        return [] as QaseProjectMetrics[];
      }),
      config.datadog
        ? fetchDatadogMetrics(config.datadog, config.periodDays).catch((e) => {
            console.error("[collector] datadog fetch failed:", e);
            return null;
          })
        : Promise.resolve(null),
    ]);

    saveToSqlite(rawBugsAll, rawIncidents, rawQase, rawDatadog);

    const bugs = exclude.size > 0
      ? rawBugsAll.filter((b) => !exclude.has(b.team.toLowerCase()) && !exclude.has(b.vertical.toLowerCase()))
      : rawBugsAll;

    const result: RawCache = { bugs, incidents: rawIncidents, qase: rawQase, datadog: rawDatadog, ts: Date.now() };
    _rawCache = result;
    _inflight = null;
    return result;
  })();

  return _inflight;
}

function ddToServiceHealth(dd: DatadogMetrics | null): ServiceHealth | null {
  if (!dd) return null;
  return {
    httpErrorRate: dd.http.errorRate,
    httpApdex: dd.http.apdex,
    httpAvgLatency: dd.http.avgLatency,
    httpRequests: dd.http.requestVolume,
    graphqlErrorRate: dd.graphql.errorRate,
    graphqlErrorCount: dd.graphql.errorCount,
    graphqlApdex: dd.graphql.apdex,
    graphqlAvgLatency: dd.graphql.avgLatency,
    graphqlRequests: dd.graphql.requestVolume,
    grpcApdex: dd.grpc.apdex,
    grpcRequests: dd.grpc.requestVolume,
    appErrors: dd.app.errorCount,
    dbDisconnects: dd.app.dbDisconnects,
    overallApdex: dd.overall.apdex,
    overallErrorRate: dd.overall.errorRate,
    totalRequests: dd.overall.totalRequests,
    iosCrashFreeRate: dd.mobile.iosCrashFreeRate,
    androidCrashFreeRate: dd.mobile.androidCrashFreeRate,
  };
}

function buildDashboardData(raw: RawCache, startDate: Date, endDate: Date, exclude?: Set<string>): DashboardData {
  let filtered = raw.bugs;
  if (exclude && exclude.size > 0) {
    filtered = filtered.filter((b) => !exclude.has(b.team.toLowerCase()) && !exclude.has(b.vertical.toLowerCase()));
  }
  const inPeriod = (dateStr: string) => {
    const d = new Date(dateStr);
    return d >= startDate && d <= endDate;
  };
  const bugs = filtered.filter((b) => inPeriod(b.createdAt));
  const incidents = raw.incidents.filter((i) => inPeriod(i.createdAt));

  return {
    generatedAt: new Date().toISOString(),
    period: {
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
    },
    bugs: computeBugMetrics(bugs),
    incidents: computeIncidentMetrics(incidents),
    automation: computeAutomationMetrics(raw.qase),
    serviceHealth: ddToServiceHealth(raw.datadog),
  };
}

const RANGE_DAYS: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, quarter: 90 };

let _cycleDatesCache: { dates: CycleDates | null; ts: number } | null = null;
const CYCLE_TTL = 30 * 60 * 1000;

async function getCycleDates(apiKey: string): Promise<CycleDates | null> {
  if (_cycleDatesCache && Date.now() - _cycleDatesCache.ts < CYCLE_TTL) return _cycleDatesCache.dates;
  const dates = await fetchCycleDates(apiKey);
  _cycleDatesCache = { dates, ts: Date.now() };
  return dates;
}

// Single assembly path: resolves the period window (incl. cycle dates), then
// computes dashboard data, trends and exec summary over the SAME window.
async function assemble(
  raw: RawCache,
  config: CollectorConfig,
  range: RangePreset,
  exclude: Set<string>,
  sourceErrors?: SourceError[],
): Promise<DashboardWithTrendsV2> {
  const { computeTrends, computeRangeDates } = await import("./trends");
  const { computeExecSummary } = await import("./health-score");

  const cycleDates = range === "cycle" ? await getCycleDates(config.linearApiKey) : undefined;
  const { currentStart, currentEnd } = computeRangeDates(range, new Date(), cycleDates ?? undefined);

  const data = buildDashboardData(raw, currentStart, currentEnd, exclude);
  const trends = computeTrends(range, raw.bugs, raw.incidents, raw.qase, new Date(), cycleDates ?? undefined);
  const exec = computeExecSummary(
    data.bugs.bugs, data.incidents.incidents, data.automation,
    data.bugs.byVertical, trends.verticalTrends, data.serviceHealth,
    raw.bugs, currentStart, currentEnd,
  );
  const oldest = getOldestFetchedAt();
  return {
    data,
    trends,
    exec,
    cachedAt: oldest ? new Date(oldest).toISOString() : undefined,
    cycleDates: cycleDates ?? undefined,
    sourceErrors: sourceErrors?.length ? sourceErrors : undefined,
  };
}

export async function collectDashboardData(config: CollectorConfig): Promise<DashboardData> {
  const raw = await fetchRaw(config);
  const exclude = new Set(config.excludeTeams.map((t) => t.toLowerCase()));
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - config.periodDays);
  return buildDashboardData(raw, startDate, endDate, exclude);
}

export async function collectWithTrends(
  config: CollectorConfig,
  range: RangePreset,
): Promise<DashboardWithTrendsV2> {
  const raw = await fetchRaw(config);
  const exclude = new Set(config.excludeTeams.map((t) => t.toLowerCase()));
  return assemble(raw, config, range, exclude);
}

export function invalidateCache() {
  _rawCache = null;
  clearAllCache();
}

export async function collectWithProgress(
  config: CollectorConfig,
  range: RangePreset,
  onProgress: (evt: ProgressEvent) => void,
): Promise<DashboardWithTrendsV2> {
  // 1. In-memory cache hit
  if (_rawCache && Date.now() - _rawCache.ts < MEMORY_TTL) {
    onProgress({ source: "linear", status: "done", detail: `${_rawCache.bugs.length} bugs (cached)` });
    onProgress({ source: "incident", status: _rawCache.incidents.length > 0 ? "done" : "skipped", detail: _rawCache.incidents.length > 0 ? `${_rawCache.incidents.length} incidents (cached)` : "No API key" });
    onProgress({ source: "qase", status: "done", detail: `${_rawCache.qase.length} projects (cached)` });
    onProgress({ source: "datadog", status: _rawCache.datadog ? "done" : "skipped", detail: _rawCache.datadog ? "Cached" : "No API key" });
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
    onProgress({ source: "datadog", status: sqliteRaw.datadog ? "done" : "skipped", detail: sqliteRaw.datadog ? "Cached" : "No API key" });
    onProgress({ source: "processing", status: "done", detail: "Cached" });

    if (hasAnyStaleSources()) refreshInBackground(config);

    return assemble(sqliteRaw, config, range, exclude);
  }

  // 3. Cold start — full fetch with progress
  const fetchFrom = new Date();
  fetchFrom.setDate(fetchFrom.getDate() - WIDE_FETCH_DAYS);
  const sinceDate = fetchFrom.toISOString();

  onProgress({ source: "linear", status: "loading" });
  onProgress({ source: "incident", status: config.incidentApiKey ? "waiting" : "skipped", detail: config.incidentApiKey ? undefined : "No API key" });
  onProgress({ source: "qase", status: "waiting" });
  onProgress({ source: "datadog", status: config.datadog ? "waiting" : "skipped", detail: config.datadog ? undefined : "No API key" });
  onProgress({ source: "processing", status: "waiting" });

  const sourceErrors: SourceError[] = [];
  const recordError = (source: SourceError["source"], e: unknown) => {
    const message = e instanceof Error ? e.message : "Failed";
    console.error(`[collector] ${source} fetch failed:`, e);
    sourceErrors.push({ source, message });
    onProgress({ source, status: "error", detail: message });
  };

  const linearPromise = fetchLinearBugs(config.linearApiKey, sinceDate, {
    allIssuesTeams: config.allIssuesTeams,
  }).then((r) => {
    onProgress({ source: "linear", status: "done", detail: `${r.length} bugs` });
    return r;
  }).catch((e) => {
    recordError("linear", e);
    return [] as LinearBug[];
  });

  const incidentPromise = config.incidentApiKey
    ? (() => {
        onProgress({ source: "incident", status: "loading" });
        return fetchIncidents(config.incidentApiKey!, sinceDate).then((r) => {
          onProgress({ source: "incident", status: "done", detail: `${r.length} incidents` });
          return r;
        }).catch((e) => {
          recordError("incident", e);
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
      recordError("qase", e);
      return [] as QaseProjectMetrics[];
    });
  })();

  const datadogPromise = config.datadog
    ? (() => {
        onProgress({ source: "datadog", status: "loading" });
        return fetchDatadogMetrics(config.datadog!, RANGE_DAYS[range] ?? 14).then((r) => {
          onProgress({ source: "datadog", status: "done", detail: `Apdex ${r.overall.apdex} · ${r.overall.errorRate}% errors` });
          return r;
        }).catch((e) => {
          recordError("datadog", e);
          return null;
        });
      })()
    : Promise.resolve(null);

  const [rawBugsAll, rawIncidents, rawQase, rawDatadog] = await Promise.all([linearPromise, incidentPromise, qasePromise, datadogPromise]);

  onProgress({ source: "processing", status: "loading" });

  saveToSqlite(rawBugsAll, rawIncidents, rawQase, rawDatadog);

  const bugs = exclude.size > 0
    ? rawBugsAll.filter((b) => !exclude.has(b.team.toLowerCase()) && !exclude.has(b.vertical.toLowerCase()))
    : rawBugsAll;

  _rawCache = { bugs, incidents: rawIncidents, qase: rawQase, datadog: rawDatadog, ts: Date.now() };

  const result = await assemble(_rawCache, config, range, exclude, sourceErrors);

  onProgress({ source: "processing", status: "done", detail: "Ready" });

  return result;
}
