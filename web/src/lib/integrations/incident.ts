import type { IncidentRecord, IncidentCategory } from "../types";

const INCIDENT_API = "https://api.incident.io/v2";

// "Category" single-select custom field — classifies an incident as a
// progression, regression, 3rd-party, or infrastructure/environment issue.
const CATEGORY_FIELD_ID = "01KMJZ8FBKD5EZC7V5FVN1PTGG";

const CATEGORY_MAP: Record<string, IncidentCategory> = {
  "Progression": "progression",
  "Regression": "regression",
  "3rd Party": "thirdParty",
  "Environment / infrastructure": "infrastructure",
};

interface CustomFieldEntry {
  custom_field: { id: string };
  values: Array<{ value_option?: { value: string } }>;
}

interface IncidentAPIResponse {
  incidents: Array<{
    id: string;
    name: string;
    severity?: { name: string };
    incident_status: { name: string; category: string };
    created_at: string;
    resolved_at?: string;
    incident_type?: { name: string };
    permalink: string;
    external_issue_reference?: { issue_name?: string };
    custom_field_entries?: CustomFieldEntry[];
  }>;
  pagination_meta?: { after?: string; total_record_count?: number };
}

function classifyCategory(entries: CustomFieldEntry[] = []): IncidentCategory {
  const entry = entries.find((e) => e.custom_field.id === CATEGORY_FIELD_ID);
  const value = entry?.values[0]?.value_option?.value;
  return value ? (CATEGORY_MAP[value] ?? "unknown") : "unknown";
}

async function fetchPage(apiKey: string, params: Record<string, string>): Promise<IncidentAPIResponse> {
  const url = new URL(`${INCIDENT_API}/incidents`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Incident.io API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<IncidentAPIResponse>;
}

function computeDuration(createdAt: string, resolvedAt?: string): number | undefined {
  if (!resolvedAt) return undefined;
  return Math.round((new Date(resolvedAt).getTime() - new Date(createdAt).getTime()) / 60000);
}

export async function fetchIncidents(apiKey: string, sinceDate: string): Promise<IncidentRecord[]> {
  const allIncidents: IncidentRecord[] = [];
  let after: string | undefined;

  while (true) {
    const params: Record<string, string> = { page_size: "100" };
    if (after) params.after = after;

    const data = await fetchPage(apiKey, params);

    for (const inc of data.incidents) {
      const created = new Date(inc.created_at);
      if (created < new Date(sinceDate)) continue;
      if (inc.incident_type?.name?.toLowerCase() !== "incident") continue;

      allIncidents.push({
        id: inc.id,
        name: inc.name,
        severity: inc.severity?.name ?? "unset",
        status: inc.incident_status.name,
        createdAt: inc.created_at,
        resolvedAt: inc.resolved_at ?? undefined,
        durationMinutes: computeDuration(inc.created_at, inc.resolved_at),
        incidentType: inc.incident_type?.name,
        url: inc.permalink,
        linearKey: inc.external_issue_reference?.issue_name ?? undefined,
        category: classifyCategory(inc.custom_field_entries),
      });
    }

    if (!data.pagination_meta?.after) break;
    after = data.pagination_meta.after;
  }

  return allIncidents;
}
