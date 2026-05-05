import type {
  DashboardConfig,
  DashboardData,
  BugMetrics,
  IncidentMetrics,
  AutomationMetrics,
  LinearBug,
  IncidentRecord,
  QaseProjectMetrics,
  VerticalStats,
  TeamStats,
} from "./types.js";
import { fetchLinearBugs, isOpen, isTriage } from "./clients/linear.js";
import { fetchIncidents } from "./clients/incident.js";
import { fetchQaseMetrics } from "./clients/qase.js";

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

    // Flat team stats
    if (!byTeam[bug.team]) byTeam[bug.team] = emptyTeamStats(bug.teamKey);
    byTeam[bug.team].total++;
    if (bugTriage) byTeam[bug.team].triage++;
    if (bugOpen) byTeam[bug.team].open++;
    if (bug.type === "regression") byTeam[bug.team].regression++;
    if (bug.type === "progression") byTeam[bug.team].progression++;

    // Vertical → subteam hierarchy
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

  // MTTR: mean time to resolve (hours) for resolved bugs
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
    mttd: null, // Incident.io does not expose MTTD natively; would need custom fields
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

export async function collectDashboardData(config: DashboardConfig): Promise<DashboardData> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - config.periodDays);
  const sinceDate = startDate.toISOString();

  console.log(`  Collecting data for the last ${config.periodDays} days...`);
  console.log(`  Period: ${startDate.toISOString().split("T")[0]} → ${endDate.toISOString().split("T")[0]}\n`);

  // Fetch all data sources in parallel
  const fetches: [Promise<LinearBug[]>, Promise<IncidentRecord[]>, Promise<QaseProjectMetrics[]>] = [
    fetchLinearBugs(config.linear.apiKey, sinceDate, {
      teamFilter: config.linear.teamFilter,
      allIssuesTeams: config.linear.allIssuesTeams,
    }).then((r) => { console.log(`  ✓ Linear: ${r.length} bugs fetched`); return r; }),

    config.incident
      ? fetchIncidents(config.incident.apiKey, sinceDate)
          .then((r) => { console.log(`  ✓ Incident.io: ${r.length} incidents fetched`); return r; })
      : Promise.resolve([]).then(() => { console.log(`  ⊘ Incident.io: skipped (no API key)`); return [] as IncidentRecord[]; }),

    fetchQaseMetrics(config.qase.apiKey, config.qase.projectCodes)
      .then((r) => { console.log(`  ✓ QASE: ${r.length} projects fetched`); return r; })
      .catch((e) => { console.warn(`  ⚠ QASE: ${e.message} — continuing without automation data`); return [] as QaseProjectMetrics[]; }),
  ];

  const [rawBugsAll, rawIncidents, rawQase] = await Promise.all(fetches);

  const exclude = new Set((config.linear.excludeTeams ?? []).map((t) => t.toLowerCase()));
  const rawBugs = exclude.size > 0
    ? rawBugsAll.filter((b) => !exclude.has(b.team.toLowerCase()) && !exclude.has(b.vertical.toLowerCase()))
    : rawBugsAll;

  if (exclude.size > 0) {
    console.log(`  Excluded ${rawBugsAll.length - rawBugs.length} bugs from ${exclude.size} filtered teams`);
  }

  return {
    generatedAt: endDate.toISOString(),
    period: {
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
    },
    bugs: computeBugMetrics(rawBugs),
    incidents: computeIncidentMetrics(rawIncidents),
    automation: computeAutomationMetrics(rawQase),
  };
}
