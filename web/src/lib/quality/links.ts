const LINEAR_ORG = "fanaticscollect";

export function linearTeamUrl(teamKey: string, view = "active"): string {
  return `https://linear.app/${LINEAR_ORG}/team/${teamKey}/${view}`;
}

export function linearFilterUrl(teamKey: string, filters: Record<string, string>): string {
  const base = `https://linear.app/${LINEAR_ORG}/team/${teamKey}/all`;
  const params = Object.entries(filters).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return params ? `${base}?${params}` : base;
}
