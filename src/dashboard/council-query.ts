import type { DashboardData } from "./types.js";

export function buildCouncilQuery(data: DashboardData): string {
  const verticalBreakdown = Object.entries(data.bugs.byVertical)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([vertical, v]) => {
      const subs = Object.entries(v.subteams)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([sub, s]) => `      - ${sub}: ${s.total} bugs (${s.open} open, ${s.regression} regr.)`)
        .join("\n");
      return `  - ${vertical}: ${v.total} bugs (${v.open} open, ${v.regression} regressions, ${v.progression} progressions)\n${subs}`;
    })
    .join("\n");

  const envBreakdown = Object.entries(data.bugs.byEnvironment)
    .sort(([, a], [, b]) => b - a)
    .map(([env, count]) => `  - ${env}: ${count}`)
    .join("\n");

  const severityBreakdown = Object.entries(data.bugs.bySeverity)
    .sort(([, a], [, b]) => b - a)
    .map(([sev, count]) => `  - ${sev}: ${count}`)
    .join("\n");

  const incidentSeverity = Object.entries(data.incidents.bySeverity)
    .sort(([, a], [, b]) => b - a)
    .map(([sev, count]) => `  - ${sev}: ${count}`)
    .join("\n");

  const qaseBreakdown = data.automation.projects
    .map((p) => {
      const coverage = p.totalCases > 0 ? Math.round((p.automatedCases / p.totalCases) * 100) : 0;
      const lastRun = p.runs[0];
      const passRate = lastRun && lastRun.stats.total > 0
        ? Math.round((lastRun.stats.passed / lastRun.stats.total) * 100)
        : "N/A";
      return `  - ${p.projectName} (${p.projectCode}): ${p.totalCases} cases, ${coverage}% automated, last pass rate: ${passRate}%`;
    })
    .join("\n");

  return `You are a Quality Engineering expert analyzing weekly quality metrics for a software organization.
Provide a C-level executive analysis: identify risks, trends, and actionable recommendations.

Period: ${data.period.start} to ${data.period.end}

═══ BUG METRICS (from Linear) ═══

Total bugs: ${data.bugs.total} (${data.bugs.open} open / ${data.bugs.closed} closed)
Regressions: ${data.bugs.byType.regression} | Progressions: ${data.bugs.byType.progression} | Unclassified: ${data.bugs.byType.unknown}
Mean Time to Resolve: ${data.bugs.mttr != null ? `${data.bugs.mttr} hours` : "N/A"}

By Vertical (Team → Sub-teams):
${verticalBreakdown || "  No data"}

By Environment:
${envBreakdown || "  No data"}

By Severity:
${severityBreakdown || "  No data"}

═══ INCIDENT METRICS (from Incident.io) ═══

Total incidents: ${data.incidents.total} (${data.incidents.open} open / ${data.incidents.resolved} resolved)
Mean Time to Resolve: ${data.incidents.mttr != null ? `${data.incidents.mttr} minutes` : "N/A"}

By Severity:
${incidentSeverity || "  No data"}

═══ TEST AUTOMATION METRICS (from QASE.io) ═══

Total test cases: ${data.automation.totalCases}
Automated: ${data.automation.automatedCases} (${data.automation.coveragePercent}%)
Manual: ${data.automation.manualCases}
Average pass rate: ${data.automation.averagePassRate}%
Total completed runs: ${data.automation.totalRuns}

By Project:
${qaseBreakdown || "  No data"}

═══ ANALYSIS REQUEST ═══

Based on these metrics, provide:
1. **Quality Health Score** (0-100) for each team/vertical and overall
2. **Top 3 Risks** — what needs immediate attention
3. **Regression Analysis** — is the regression rate concerning? Trend direction?
4. **Incident Impact** — are incidents correlated with specific teams or environments?
5. **Automation Coverage Assessment** — is coverage adequate? Where to invest next?
6. **Week-over-Week Trend** (based on raw numbers, flag if data seems anomalous)
7. **Actionable Recommendations** — 3-5 specific actions for the next sprint

Format your analysis for a C-level audience: concise, data-driven, no jargon.`;
}
