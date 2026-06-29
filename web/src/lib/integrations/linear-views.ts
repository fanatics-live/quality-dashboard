import fs from "fs";
import path from "path";
import { BUG_LABELS, BUG_TYPE_LABELS } from "./linear";

const LINEAR_API = "https://api.linear.app/graphql";
const LINEAR_ORG = "fanaticscollect";
const VIEW_PREFIX = "QD: ";
const CACHE_PATH = path.join(process.cwd(), "data", "linear-views.json");

const ACTIVE_STATE_FILTER = { state: { type: { in: ["triage", "backlog", "unstarted", "started"] } } };

type ViewMap = Record<string, string>;

function loadCache(): ViewMap {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveCache(map: ViewMap): void {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(map, null, 2));
}

let _cache: ViewMap | null = null;

function getCache(): ViewMap {
  if (!_cache) _cache = loadCache();
  return _cache;
}

function setSlug(key: string, slugId: string): void {
  const cache = getCache();
  cache[key] = slugId;
  _cache = cache;
  saveCache(cache);
}

async function gql<T>(apiKey: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear API: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

function viewUrl(slugId: string): string {
  return `https://linear.app/${LINEAR_ORG}/view/${slugId}`;
}

async function findViewByName(apiKey: string, name: string): Promise<string | null> {
  const data = await gql<{ customViews: { nodes: { slugId: string }[] } }>(
    apiKey,
    `query($name: String!) { customViews(filter: { name: { eq: $name } } first: 1) { nodes { slugId } } }`,
    { name },
  );
  return data.customViews.nodes[0]?.slugId ?? null;
}

async function createView(apiKey: string, name: string, filterData: object): Promise<string> {
  const data = await gql<{ customViewCreate: { success: boolean; customView: { slugId: string } } }>(
    apiKey,
    `mutation($input: CustomViewCreateInput!) { customViewCreate(input: $input) { success customView { slugId } } }`,
    { input: { name, filterData, shared: false } },
  );
  if (!data.customViewCreate.success) throw new Error(`Failed to create view: ${name}`);
  return data.customViewCreate.customView.slugId;
}

async function ensureView(apiKey: string, key: string, name: string, filterData: object): Promise<string> {
  const cached = getCache()[key];
  if (cached) return viewUrl(cached);

  const existing = await findViewByName(apiKey, name);
  if (existing) {
    setSlug(key, existing);
    return viewUrl(existing);
  }

  const slugId = await createView(apiKey, name, filterData);
  setSlug(key, slugId);
  return viewUrl(slugId);
}

function bugLabelFilter() {
  return { labels: { some: { name: { in: BUG_LABELS } } } };
}

const SEVERITY_LABEL: Record<string, string> = {
  Critical: "Critical Severity",
  High: "High Severity",
  Medium: "Medium Severity",
  Low: "Low Severity",
};
const ENV_LABEL: Record<string, string> = {
  Production: "Production bug",
  Staging: "Staging bug",
  Development: "Dev bug",
  Dogfood: "Dogfood bug",
};
const TYPE_LABEL: Record<string, string> = { Regression: "Regression bug", Progression: "Progression bug" };

let _teamCache: Map<string, string> | null = null;

async function resolveTeamId(apiKey: string, teamKey: string): Promise<string | null> {
  if (!_teamCache) {
    const data = await gql<{ teams: { nodes: { id: string; key: string }[] } }>(
      apiKey,
      `{ teams(first: 100) { nodes { id key } } }`,
    );
    _teamCache = new Map(data.teams.nodes.map((t) => [t.key, t.id]));
  }
  return _teamCache.get(teamKey) ?? null;
}

const FALLBACK = `https://linear.app/${LINEAR_ORG}`;

export async function getViewUrl(apiKey: string, viewType: string, value?: string): Promise<string> {
  switch (viewType) {
    case "all-bugs":
      return ensureView(apiKey, "all-bugs", `${VIEW_PREFIX}All Bugs`, {
        and: [bugLabelFilter(), ACTIVE_STATE_FILTER],
      });

    case "regressions":
      return ensureView(apiKey, "regressions", `${VIEW_PREFIX}Regressions`, {
        and: [{ labels: { some: { name: { in: ["Regression bug"] } } } }, ACTIVE_STATE_FILTER],
      });

    case "severity": {
      const label = SEVERITY_LABEL[value ?? ""];
      if (!label) return getViewUrl(apiKey, "all-bugs");
      return ensureView(apiKey, `severity-${value}`, `${VIEW_PREFIX}Severity: ${value}`, {
        and: [bugLabelFilter(), { labels: { some: { name: { in: [label] } } } }, ACTIVE_STATE_FILTER],
      });
    }

    case "environment": {
      const label = ENV_LABEL[value ?? ""];
      if (!label) return getViewUrl(apiKey, "all-bugs");
      return ensureView(apiKey, `env-${value}`, `${VIEW_PREFIX}Env: ${value}`, {
        and: [bugLabelFilter(), { labels: { some: { name: { in: [label] } } } }, ACTIVE_STATE_FILTER],
      });
    }

    case "type": {
      if (value === "Unclassified") {
        return ensureView(apiKey, "type-unclassified", `${VIEW_PREFIX}Unclassified Bugs`, {
          and: [
            bugLabelFilter(),
            { labels: { every: { name: { nin: BUG_TYPE_LABELS } } } },
            ACTIVE_STATE_FILTER,
          ],
        });
      }
      const label = TYPE_LABEL[value ?? ""];
      if (!label) return getViewUrl(apiKey, "all-bugs");
      return ensureView(apiKey, `type-${value}`, `${VIEW_PREFIX}Type: ${value}`, {
        and: [bugLabelFilter(), { labels: { some: { name: { in: [label] } } } }, ACTIVE_STATE_FILTER],
      });
    }

    case "team-bugs": {
      if (!value) return FALLBACK;
      const teamId = await resolveTeamId(apiKey, value);
      if (!teamId) return FALLBACK;
      return ensureView(apiKey, `team-${value}`, `${VIEW_PREFIX}Team: ${value}`, {
        and: [bugLabelFilter(), { team: { id: { in: [teamId] } } }, ACTIVE_STATE_FILTER],
      });
    }

    case "team-regressions": {
      if (!value) return FALLBACK;
      const teamId = await resolveTeamId(apiKey, value);
      if (!teamId) return FALLBACK;
      return ensureView(apiKey, `team-regr-${value}`, `${VIEW_PREFIX}Team Regressions: ${value}`, {
        and: [
          { labels: { some: { name: { in: ["Regression bug"] } } } },
          { team: { id: { in: [teamId] } } },
          ACTIVE_STATE_FILTER,
        ],
      });
    }

    default:
      return FALLBACK;
  }
}
