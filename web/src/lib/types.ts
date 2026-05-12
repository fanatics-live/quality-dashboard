export interface LinearBug {
  id: string;
  title: string;
  team: string;
  teamKey: string;
  vertical: string;
  subteam: string;
  type: "regression" | "progression" | "unknown";
  environment: string;
  severity: "critical" | "high" | "medium" | "low";
  status: string;
  stateType: "triage" | "backlog" | "unstarted" | "started" | "completed" | "canceled";
  createdAt: string;
  resolvedAt?: string;
  url: string;
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

export interface DashboardData {
  generatedAt: string;
  period: { start: string; end: string };
  bugs: BugMetrics;
  incidents: IncidentMetrics;
  automation: AutomationMetrics;
}

// ── Trend types ──

export type RangePreset = "7d" | "14d" | "30d" | "quarter";

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
}

export interface VerticalTrend {
  name: string;
  bugs: Delta;
  open: Delta;
  regressions: Delta;
}

export interface TrendData {
  range: RangePreset;
  current: { start: string; end: string };
  previous: { start: string; end: string };
  bugs: Delta;
  openBugs: Delta;
  regressions: Delta;
  incidents: Delta;
  mttr: Delta;
  passRate: Delta;
  coverage: Delta;
  timeSeries: TimePoint[];
  verticalTrends: VerticalTrend[];
}

export interface DashboardWithTrends {
  data: DashboardData;
  trends: TrendData;
  cachedAt?: string;
}

export type SourceId = "linear" | "incident" | "qase" | "processing";
export type SourceStatus = "waiting" | "loading" | "done" | "skipped" | "error";

export interface ProgressEvent {
  source: SourceId;
  status: SourceStatus;
  detail?: string;
}

export type Grade = "A" | "B" | "C" | "D" | "E";

export interface VerticalSummary {
  name: string;
  slug: string;
  grade: Grade;
  stats: VerticalStats;
  mainTeamKey: string;
}
