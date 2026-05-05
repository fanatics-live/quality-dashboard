import type { LinearBug } from "../types.js";

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
  url: string;
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
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear API error: ${res.status} ${res.statusText}`);
  return res.json();
}

const BUG_LABELS = [
  "bug", "Bug Report", "Bug Fix", "Bug (functional or design)",
  "Bug category", "Functional", "Performance", "UI / cosmetics",
  "Production bug", "Staging bug", "Dev bug",
  "BO fast follow bug", "Product Defect Submissions",
  "Regression bug", "Progression bug",
  "defect", "Defect",
];

function classifyType(labels: string[]): LinearBug["type"] {
  if (labels.some((l) => l === "Regression bug")) return "regression";
  if (labels.some((l) => l === "Progression bug")) return "progression";
  return "unknown";
}

function classifyEnvironment(labels: string[]): string {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.some((l) => l === "production bug" || l.includes("prod bug"))) return "production";
  if (lower.some((l) => l === "staging bug" || l.includes("staging"))) return "staging";
  if (lower.some((l) => l === "dev bug" || l.includes("dev bug"))) return "development";
  return "unspecified";
}

function priorityToSeverity(priority: number): LinearBug["severity"] {
  switch (priority) {
    case 1: return "critical";
    case 2: return "high";
    case 3: return "medium";
    default: return "low";
  }
}

// Derive vertical and subteam from Linear team name
// Patterns: "[Vertical] Subteam", "Vertical Subteam", or standalone
export function parseTeamHierarchy(teamName: string): { vertical: string; subteam: string } {
  // Pattern: [Vertical] Subteam
  const bracketMatch = teamName.match(/^\[(.+?)\]\s*(.+)$/);
  if (bracketMatch) {
    return { vertical: bracketMatch[1], subteam: bracketMatch[2] };
  }

  // Pattern: known prefixes
  const prefixes = [
    "Collecting", "Client", "Marketplace", "Card", "Collect App",
  ];
  for (const prefix of prefixes) {
    if (teamName.startsWith(prefix) && teamName.length > prefix.length) {
      const sub = teamName.slice(prefix.length).trim();
      if (sub) return { vertical: prefix, subteam: sub };
    }
  }

  // Standalone team = its own vertical
  return { vertical: teamName, subteam: "" };
}

const ISSUE_FIELDS = `
  id title state { name type } priority createdAt completedAt
  team { name key } labels { nodes { name } } url
`;

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
    severity: priorityToSeverity(node.priority),
    status: node.state.name,
    stateType: node.state.type as LinearBug["stateType"],
    createdAt: node.createdAt,
    resolvedAt: node.completedAt ?? undefined,
    url: node.url,
  };
}

export function isTriage(bug: LinearBug): boolean {
  return bug.stateType === "triage";
}

export function isOpen(bug: LinearBug): boolean {
  return bug.stateType === "backlog" || bug.stateType === "unstarted" || bug.stateType === "started";
}

export async function fetchLinearBugs(
  apiKey: string,
  sinceDate: string,
  options: {
    teamFilter?: string[];
    allIssuesTeams?: string[];
  } = {},
): Promise<LinearBug[]> {
  const teamFilterClause = options.teamFilter?.length
    ? `, team: { name: { in: ${JSON.stringify(options.teamFilter)} } }`
    : "";

  // Query 1: bug-labeled issues from all teams
  const bugFilter = `labels: { some: { name: { in: ${JSON.stringify(BUG_LABELS)} } } }, createdAt: { gte: "${sinceDate}" }${teamFilterClause}`;
  const bugNodes = await paginateIssues(apiKey, bugFilter);

  // Query 2: ALL issues from teams that don't label bugs
  let allIssueNodes: LinearIssueNode[] = [];
  if (options.allIssuesTeams?.length) {
    const allFilter = `team: { name: { in: ${JSON.stringify(options.allIssuesTeams)} } }, createdAt: { gte: "${sinceDate}" }`;
    allIssueNodes = await paginateIssues(apiKey, allFilter);
  }

  // Merge and deduplicate by id
  const seen = new Set<string>();
  const allBugs: LinearBug[] = [];
  for (const node of [...bugNodes, ...allIssueNodes]) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    allBugs.push(nodeToBug(node));
  }

  return allBugs;
}
