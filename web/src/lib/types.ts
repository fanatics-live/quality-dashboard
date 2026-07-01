export interface LinearBug {
  id: string;
  title: string;
  team: string;
  teamKey: string;
  vertical: string;
  subteam: string;
  type: "regression" | "progression" | "legacy" | "thirdParty" | "unknown";
  environment: string;
  severity: string;
  priority: number;
  status: string;
  stateType: "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled";
  createdAt: string;
  resolvedAt?: string;
  url: string;
  releaseBlocker: boolean;
  projectId?: string;
}

export interface TeamStats {
  total: number;
  triage: number;
  open: number;
  regression: number;
  progression: number;
  teamKey: string;
}

export interface VerticalStats {
  total: number;
  triage: number;
  open: number;
  regression: number;
  progression: number;
  subteams: Record<string, TeamStats>;
}

export interface LinearProject {
  id: string;
  name: string;
  state: string;
  progress: number; // 0–1
  startDate?: string;
  targetDate?: string;
  lead?: string;
  health?: string;
  verticals: string[];
  url: string;
}

export type IncidentCategory =
  | "progression"
  | "regression"
  | "thirdParty"
  | "infrastructure"
  | "unknown";

export interface IncidentRecord {
  id: string;
  name: string;
  severity: string;
  status: string;
  createdAt: string;
  resolvedAt?: string;
  durationMinutes?: number;
  incidentType?: string;
  url: string;
  linearKey?: string;
  category: IncidentCategory;
}

export interface QaseTestRun {
  id: number;
  title: string;
  projectCode: string;
  status: string;
  startTime: string;
  endTime?: string;
  stats: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
  };
}

export interface QaseProjectMetrics {
  projectCode: string;
  projectName: string;
  totalCases: number;
  automatedCases: number;
  manualCases: number;
  runs: QaseTestRun[];
}

export interface BugMetrics {
  total: number;
  triage: number;
  open: number;
  closed: number;
  byTeam: Record<string, TeamStats>;
  byVertical: Record<string, VerticalStats>;
  byType: { regression: number; progression: number; unknown: number };
  byEnvironment: Record<string, number>;
  bySeverity: Record<string, number>;
  mttr: number | null;
  bugs: LinearBug[];
}

export interface IncidentMetrics {
  total: number;
  open: number;
  resolved: number;
  bySeverity: Record<string, number>;
  mttr: number | null;
  mttd: number | null;
  incidents: IncidentRecord[];
}

export interface AutomationMetrics {
  totalCases: number;
  automatedCases: number;
  manualCases: number;
  coveragePercent: number;
  averagePassRate: number;
  totalRuns: number;
  projects: QaseProjectMetrics[];
}

export interface ServiceHealth {
  httpErrorRate: number;
  httpApdex: number;
  httpAvgLatency: number;
  httpRequests: number;
  graphqlErrorRate: number;
  graphqlErrorCount: number;
  graphqlApdex: number;
  graphqlAvgLatency: number;
  graphqlRequests: number;
  grpcApdex: number;
  grpcRequests: number;
  appErrors: number;
  dbDisconnects: number;
  overallApdex: number;
  overallErrorRate: number;
  totalRequests: number;
  iosCrashFreeRate: number | null;
  androidCrashFreeRate: number | null;
}

export interface DashboardData {
  generatedAt: string;
  period: { start: string; end: string };
  bugs: BugMetrics;
  incidents: IncidentMetrics;
  automation: AutomationMetrics;
  serviceHealth: ServiceHealth | null;
}

// ── Trend types ──

export type RangePreset = "14d" | "30d" | "quarter" | "cycle";

// Environment scope for the dashboard. "all" = every bug; otherwise only bugs
// whose classified environment matches are kept (see classifyEnvironment).
export type EnvFilter = "all" | "Production" | "Staging" | "Development" | "Dogfood";

export interface CycleDates {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
}

export interface Delta {
  current: number;
  previous: number;
  change: number;
  changePercent: number | null;
  direction: "up" | "down" | "flat";
  sentiment: "good" | "bad" | "neutral";
}

export interface TimePoint {
  date: string;
  bugs: number;
  regressions: number;
  incidents: number;
  cumulativeBugs: number;
  cumulativeRegressions: number;
}

export interface VerticalTrend {
  name: string;
  bugs: Delta;
  open: Delta;
  regressions: Delta;
  progressions: Delta;
  prodEscaped: Delta;
  incidents: Delta;
  incidentRecords: IncidentRecord[];
  classification: {
    regressions: Delta;
    progressions: Delta;
    unknown: Delta;
  };
}

export interface TrendData {
  range: RangePreset;
  current: { start: string; end: string };
  previous: { start: string; end: string };
  bugs: Delta;
  openBugs: Delta;
  regressions: Delta;
  progressions: Delta;
  unknownType: Delta;
  incidents: Delta;
  mttr: Delta;
  passRate: Delta;
  classification: {
    regressions: Delta;
    progressions: Delta;
    unknown: Delta;
  };
  timeSeries: TimePoint[];
  verticalTrends: VerticalTrend[];
}

export interface DashboardWithTrends {
  data: DashboardData;
  trends: TrendData;
  cachedAt?: string;
}

export type SourceId = "linear" | "incident" | "qase" | "datadog" | "processing";
export type SourceStatus = "waiting" | "loading" | "done" | "skipped" | "error";

export interface ProgressEvent {
  source: SourceId;
  status: SourceStatus;
  detail?: string;
}

export interface SourceError {
  source: SourceId;
  message: string;
}

export type Grade = "A" | "B" | "C" | "D" | "E";

// ── Executive metrics ──

export interface HealthSubScore {
  score: number;
  weight: number;
  components: Record<string, number>;
}

export interface HealthScore {
  overall: number;
  grade: Grade;
  stability: HealthSubScore;
  reliability: HealthSubScore;
  prevention: HealthSubScore;
  delivery: HealthSubScore;
}

export interface BugAgingBuckets {
  fresh: number;      // < 7 days
  recent: number;     // 7–30 days
  aging: number;      // 30–60 days
  stale: number;      // 60–90 days
  critical: number;   // > 90 days
  total: number;
}

export type RiskLevel = "critical" | "high" | "watch" | "stable" | "improving";

export interface TeamRisk {
  name: string;
  slug: string;
  level: RiskLevel;
  score: number;
  signals: string[];
  teamKey: string;
  stats: VerticalStats;
  bugsDelta: Delta;
  regressionRate: number;
  aging: BugAgingBuckets;
  openCriticals: number;
}

export interface BugFlowRow {
  vertical: string;
  created: number;
  closed: number;
  delta: number;
}

export interface ExecSummary {
  healthScore: HealthScore;
  escapedDefectRate: number;
  openCriticals: number;
  incidentSeverityScore: number;
  incidentsBySeverity: Record<string, number>;
  regressionRate: number;
  regressionsByVertical: Array<{ vertical: string; regressions: number; total: number; rate: number }>;
  bugAging: BugAgingBuckets;
  teamRisks: TeamRisk[];
  customerBugs: number;
  productionBugs: number;
  prodBugsByVertical: Record<string, number>;
  productionBugsList: LinearBug[];
  openCriticalsList: LinearBug[];
  bugFlow: { created: number; closed: number; delta: number; byVertical: BugFlowRow[] };
  pipelineRegressionRate: number;
  pipelineRegressionsByVertical: Array<{ vertical: string; regressions: number; total: number; rate: number }>;
  preProdBugFlow: { created: number; closed: number; delta: number; byVertical: BugFlowRow[] };
  preProdBugAging: BugAgingBuckets;
  preProdBugAgingList: LinearBug[];
  automationHealth: { coverage: number; passRate: number };
  serviceHealth: ServiceHealth | null;
  kr1ProdDefects: OkrVerticalComparison;
  kr2ReleaseBlockers: OkrVerticalComparison;
}

// Q2 vs Q1 2026 per-vertical comparison for an OKR key result.
// Counts bugs matching the KR predicate, excluding canceled/triage and
// invalid statuses. A fixed set of non-product verticals is excluded.
export interface OkrVerticalComparison {
  q1Total: number;
  q2Total: number;
  changePercent: number | null;
  byVertical: Array<{ vertical: string; q1: number; q2: number; changePercent: number | null; q2Bugs: LinearBug[] }>;
}

export interface VerticalSummary {
  name: string;
  slug: string;
  grade: Grade;
  stats: VerticalStats;
  mainTeamKey: string;
}

export interface DashboardWithTrendsV2 extends DashboardWithTrends {
  exec: ExecSummary;
  cycleDates?: CycleDates;
  sourceErrors?: SourceError[];
}
