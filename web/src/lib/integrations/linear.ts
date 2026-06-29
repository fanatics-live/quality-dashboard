import type { LinearBug, CycleDates, LinearProject } from "../types";
import { withRetry } from "../retry";

const LINEAR_API = "https://api.linear.app/graphql";

interface LinearIssueNode {
  id: string;
  title: string;
  state: { name: string; type: string };
  priority: number;
  createdAt: string;
  completedAt?: string;
  team: { name: string; key: string };
  labels: { nodes: { name: string }[] };
  project?: { id: string } | null;
  url: string;
  history?: { nodes: { createdAt: string; toState?: { name: string } | null }[] };
}

interface LinearResponse {
  data: {
    issues: {
      nodes: LinearIssueNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  };
}

async function graphql(apiKey: string, query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  return withRetry(async () => {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const err = new Error(`Linear API error: ${res.status} ${res.statusText}`);
      (err as Error & { retryable?: boolean }).retryable = res.status === 429 || res.status >= 500;
      throw err;
    }
    return res.json();
  });
}

export const BUG_LABELS = [
  "Regression bug", "Progression bug",
  "Critical Severity", "High Severity", "Medium Severity", "Low Severity",
  "bug",
  "Functional",
  "Bug (functional or design)",
];

const ACTIVE_STATES = ["triage", "backlog", "unstarted", "started", "completed", "canceled"];

// The four members of the "Bug type" Linear label group. A bug carrying any of
// these is classified; carrying none means its Bug type is missing/unclassified.
export const BUG_TYPE_LABELS = ["Regression bug", "Progression bug", "Legacy", "3rd Party"];

// The "Bug type" Linear label group has four members; anything else is unknown.
function classifyType(labels: string[]): LinearBug["type"] {
  if (labels.includes("Regression bug")) return "regression";
  if (labels.includes("Progression bug")) return "progression";
  if (labels.includes("Legacy")) return "legacy";
  if (labels.includes("3rd Party")) return "thirdParty";
  return "unknown";
}

const SEV_MAP: Record<string, string> = {
  "Critical Severity": "Critical",
  "High Severity": "High",
  "Medium Severity": "Medium",
  "Low Severity": "Low",
};

function classifySeverity(labels: string[]): string {
  for (const l of labels) {
    if (SEV_MAP[l]) return SEV_MAP[l];
  }
  return "Unclassified";
}

const ENV_MAP: Record<string, string> = {
  "Production bug": "Production",
  "Staging bug": "Staging",
  "Dev bug": "Development",
  "Dogfood bug": "Dogfood",
};

function classifyEnvironment(labels: string[]): string {
  for (const l of labels) {
    if (ENV_MAP[l]) return ENV_MAP[l];
  }
  return "Unclassified";
}

export function parseTeamHierarchy(teamName: string): { vertical: string; subteam: string } {
  const bracketMatch = teamName.match(/^\[(.+?)\]\s*(.+)$/);
  if (bracketMatch) {
    return { vertical: bracketMatch[1], subteam: bracketMatch[2] };
  }

  const VERTICAL_MAP: Record<string, string> = {
    "Collections": "Collections",
    "Collecting": "Collections",
  };
  const prefixes = ["Collections", "Collecting", "Client", "Marketplace", "Collect App", "Platform"];
  for (const prefix of prefixes) {
    if (teamName.startsWith(prefix) && teamName.length > prefix.length) {
      const sub = teamName.slice(prefix.length).trim();
      if (sub) return { vertical: VERTICAL_MAP[prefix] ?? prefix, subteam: sub };
    }
  }

  if (VERTICAL_MAP[teamName]) {
    return { vertical: VERTICAL_MAP[teamName], subteam: "(main)" };
  }

  return { vertical: teamName, subteam: "" };
}

// "QA Verified" is the resolution milestone: depending on the team it maps to a
// Linear state of type "started" OR "completed", so resolution can't be derived
// from stateType/completedAt alone. We read issue history to find the first
// transition into that state and treat its timestamp as the resolution time.
const QA_VERIFIED = "qa verified";

const ISSUE_FIELDS = `
  id title state { name type } priority createdAt completedAt
  team { name key } labels { nodes { name } } project { id } url
  history(first: 50) { nodes { createdAt toState { name } } }
`;

function qaVerifiedAt(node: LinearIssueNode): string | undefined {
  let earliest: string | undefined;
  for (const h of node.history?.nodes ?? []) {
    if (h.toState?.name.toLowerCase().trim() === QA_VERIFIED) {
      if (!earliest || h.createdAt < earliest) earliest = h.createdAt;
    }
  }
  return earliest;
}

async function paginateIssues(apiKey: string, filterClause: string): Promise<LinearIssueNode[]> {
  const query = `
    query($after: String) {
      issues(filter: { ${filterClause} } first: 100 after: $after orderBy: createdAt) {
        nodes { ${ISSUE_FIELDS} }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const nodes: LinearIssueNode[] = [];
  let cursor: string | undefined;
  while (true) {
    const result = (await graphql(apiKey, query, { after: cursor })) as LinearResponse;
    nodes.push(...result.data.issues.nodes);
    if (!result.data.issues.pageInfo.hasNextPage) break;
    cursor = result.data.issues.pageInfo.endCursor;
  }
  return nodes;
}

function nodeToBug(node: LinearIssueNode): LinearBug {
  const labels = node.labels.nodes.map((l) => l.name);
  const { vertical, subteam } = parseTeamHierarchy(node.team.name);
  return {
    id: node.id,
    title: node.title,
    team: node.team.name,
    teamKey: node.team.key,
    vertical,
    subteam,
    type: classifyType(labels),
    environment: classifyEnvironment(labels),
    severity: classifySeverity(labels),
    priority: node.priority,
    status: node.state.name,
    stateType: node.state.type as LinearBug["stateType"],
    createdAt: node.createdAt,
    resolvedAt: qaVerifiedAt(node) ?? node.completedAt ?? undefined,
    url: node.url,
    releaseBlocker: labels.includes("Release Blocker"),
    projectId: node.project?.id ?? undefined,
  };
}

export function isTriage(bug: LinearBug): boolean {
  return bug.stateType === "triage";
}

export function isOpen(bug: LinearBug): boolean {
  return bug.stateType === "triage" || bug.stateType === "backlog" || bug.stateType === "unstarted" || bug.stateType === "started";
}

export function isClosed(bug: LinearBug): boolean {
  return bug.stateType === "completed" || bug.stateType === "canceled";
}

const EXCLUDED_STATUSES = new Set([
  "cancelled", "canceled", "duplicate", "cannot reproduce",
  "invalid", "as designed", "environment", "3rd party",
  "won't fix", "wont fix", "won't do", "wont do", "not a bug",
]);

const CLASSIFICATION_EXCLUDED = new Set([
  ...EXCLUDED_STATUSES,
  "release ready", "done", "released/done",
]);

export function isValidBug(bug: LinearBug): boolean {
  if (bug.stateType === "canceled") return false;
  if (EXCLUDED_STATUSES.has(bug.status.toLowerCase())) return false;
  return true;
}

export function isClassificationBug(bug: LinearBug): boolean {
  if (!isValidBug(bug)) return false;
  if (!isOpen(bug)) return false;
  if (CLASSIFICATION_EXCLUDED.has(bug.status.toLowerCase())) return false;
  return true;
}

export async function fetchLinearBugs(
  apiKey: string,
  sinceDate: string,
  options: { teamFilter?: string[]; allIssuesTeams?: string[] } = {},
): Promise<LinearBug[]> {
  const teamFilterClause = options.teamFilter?.length
    ? `, team: { name: { in: ${JSON.stringify(options.teamFilter)} } }`
    : "";

  const stateFilter = `, state: { type: { in: ${JSON.stringify(ACTIVE_STATES)} } }`;
  const bugFilter = `labels: { some: { name: { in: ${JSON.stringify(BUG_LABELS)} } } }, createdAt: { gte: "${sinceDate}" }${teamFilterClause}${stateFilter}`;
  const bugNodes = await paginateIssues(apiKey, bugFilter);

  return bugNodes.map(nodeToBug);
}

interface ProjectNode {
  id: string;
  name: string;
  state: string;
  progress: number;
  startDate?: string;
  targetDate?: string;
  health?: string;
  lead?: { name: string } | null;
  teams: { nodes: { name: string }[] };
  url: string;
}

interface ProjectsResponse {
  data: {
    projects: {
      nodes: ProjectNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  };
}

export async function fetchLinearProjects(apiKey: string): Promise<LinearProject[]> {
  const query = `
    query($after: String) {
      projects(first: 100 after: $after) {
        nodes {
          id name state progress startDate targetDate health
          lead { name }
          teams { nodes { name } }
          url
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const nodes: ProjectNode[] = [];
  let cursor: string | undefined;
  while (true) {
    const result = (await graphql(apiKey, query, { after: cursor })) as ProjectsResponse;
    nodes.push(...result.data.projects.nodes);
    if (!result.data.projects.pageInfo.hasNextPage) break;
    cursor = result.data.projects.pageInfo.endCursor;
  }

  return nodes.map((n) => {
    const verticals = [
      ...new Set(n.teams.nodes.map((t) => parseTeamHierarchy(t.name).vertical)),
    ];
    return {
      id: n.id,
      name: n.name,
      state: n.state,
      progress: n.progress,
      startDate: n.startDate ?? undefined,
      targetDate: n.targetDate ?? undefined,
      lead: n.lead?.name ?? undefined,
      health: n.health ?? undefined,
      verticals,
      url: n.url,
    };
  });
}

interface CycleNode {
  startsAt: string;
  endsAt: string;
}

interface CyclesResponse {
  data: {
    cycles: {
      nodes: CycleNode[];
    };
  };
}

function pickMostFrequent(cycles: CycleNode[]): { start: string; end: string } | null {
  const counts = new Map<string, { count: number; start: string; end: string }>();
  for (const c of cycles) {
    const key = `${c.startsAt.slice(0, 10)}|${c.endsAt.slice(0, 10)}`;
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { count: 1, start: c.startsAt, end: c.endsAt });
  }
  let best: { count: number; start: string; end: string } | null = null;
  for (const v of counts.values()) {
    if (!best || v.count > best.count) best = v;
  }
  return best ? { start: best.start, end: best.end } : null;
}

export async function fetchCycleDates(apiKey: string): Promise<CycleDates | null> {
  const activeRes = (await graphql(apiKey, `{
    cycles(filter: { isActive: { eq: true } } first: 100) {
      nodes { startsAt endsAt }
    }
  }`)) as CyclesResponse;

  const current = pickMostFrequent(activeRes.data.cycles.nodes);
  if (!current) return null;

  const pastRes = (await graphql(apiKey, `{
    cycles(filter: { isPast: { eq: true } } first: 100 orderBy: updatedAt) {
      nodes { startsAt endsAt }
    }
  }`)) as CyclesResponse;

  const previous = pickMostFrequent(pastRes.data.cycles.nodes);
  if (!previous) return null;

  return {
    currentStart: current.start,
    currentEnd: current.end,
    previousStart: previous.start,
    previousEnd: previous.end,
  };
}
