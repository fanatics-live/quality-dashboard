const LINEAR_ORG = "fanaticscollect";

export function linearTeamUrl(teamKey: string, view = "active"): string {
  return `https://linear.app/${LINEAR_ORG}/team/${teamKey}/${view}`;
}

export function linearOrgBugsUrl(): string {
  return `/api/linear-redirect?view=all-bugs`;
}

export function linearSeverityUrl(severity: string): string {
  return `/api/linear-redirect?view=severity&value=${encodeURIComponent(severity)}`;
}

export function linearEnvironmentUrl(env: string): string {
  return `/api/linear-redirect?view=environment&value=${encodeURIComponent(env)}`;
}

export function linearBugTypeUrl(type: string): string {
  return `/api/linear-redirect?view=type&value=${encodeURIComponent(type)}`;
}

export function linearLabelUrl(label: string): string {
  if (label === "Regression bug") return `/api/linear-redirect?view=regressions`;
  return linearOrgBugsUrl();
}

export function linearFilterUrl(teamKey: string, filters: Record<string, string>): string {
  if (filters.label === "Regression bug") {
    return `/api/linear-redirect?view=team-regressions&value=${encodeURIComponent(teamKey)}`;
  }
  return `/api/linear-redirect?view=team-bugs&value=${encodeURIComponent(teamKey)}`;
}
