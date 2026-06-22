// Display thresholds shared across dashboard components.
// Scoring weights stay in health-score.ts; these only drive colors/accents.

export const THRESHOLDS = {
  // KPI strip
  totalOpenBugs: { danger: 20, warning: 10 },
  regressionCount: { danger: 5, warning: 2 },
  incidentCount: { danger: 5, warning: 2 },
  bugMttrHours: { danger: 72 },

  // Rates (%)
  escapedDefectRate: { bad: 30, watch: 15 },
  pipelineRegressionRate: { bad: 20, watch: 10 },
  passRate: { good: 90, watch: 70 },

  // Exec quadrants
  prodIncidents: { bad: 3 },
  prodBugs: { bad: 15, watch: 5 },

  // Team-level (team ranking, vertical cards)
  teamOpenBugs: { danger: 5, warning: 2 },
  teamRegressions: { danger: 3 },
  teamAging30Plus: { warning: 3 },
} as const;
