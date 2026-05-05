// ── Raw Data Types ──

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

// ── Aggregated Dashboard Data ──

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
  mttr: number | null; // mean time to resolve in hours
  bugs: LinearBug[];
}

export interface IncidentMetrics {
  total: number;
  open: number;
  resolved: number;
  bySeverity: Record<string, number>;
  mttr: number | null; // mean time to resolve in minutes
  mttd: number | null; // mean time to detect in minutes
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

export interface DashboardConfig {
  linear: {
    apiKey: string;
    teamFilter?: string[];
    excludeTeams?: string[];
    allIssuesTeams?: string[];
    bugLabelRegression?: string;
    bugLabelProgression?: string;
  };
  incident: { apiKey: string } | null;
  qase: { apiKey: string; projectCodes: string[] };
  periodDays: number;
}
