import type { QaseProjectMetrics, QaseTestRun } from "../types.js";

const QASE_API = "https://api.qase.io/v1";

async function qaseFetch(apiKey: string, path: string): Promise<unknown> {
  const res = await fetch(`${QASE_API}${path}`, {
    headers: { Token: apiKey, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`QASE API error: ${res.status} ${res.statusText} — ${path}`);
  return res.json();
}

interface QaseCasesResponse {
  status: boolean;
  result: { total: number; filtered: number; count: number; entities: Array<{ automation: number }> };
}

interface QaseRunsResponse {
  status: boolean;
  result: {
    total: number;
    filtered: number;
    count: number;
    entities: Array<{
      id: number;
      title: string;
      status: number;
      start_time: string;
      end_time?: string;
      stats: { total: number; passed: number; failed: number; skipped: number; blocked: number };
    }>;
  };
}

interface QaseProjectResponse {
  status: boolean;
  result: { code: string; title: string };
}

export async function fetchQaseMetrics(apiKey: string, projectCodes: string[]): Promise<QaseProjectMetrics[]> {
  const projects: QaseProjectMetrics[] = [];

  for (const code of projectCodes) {
    const [projectData, casesData, runsData] = await Promise.all([
      qaseFetch(apiKey, `/project/${code}`) as Promise<QaseProjectResponse>,
      qaseFetch(apiKey, `/case/${code}?limit=1&offset=0`) as Promise<QaseCasesResponse>,
      qaseFetch(apiKey, `/run/${code}?limit=10&offset=0`) as Promise<QaseRunsResponse>,
    ]);

    const totalCases = casesData.result.total;

    // Fetch all cases to count automation status
    let automatedCount = 0;
    let offset = 0;
    const limit = 100;
    while (offset < totalCases) {
      const batch = (await qaseFetch(apiKey, `/case/${code}?limit=${limit}&offset=${offset}`)) as QaseCasesResponse;
      for (const c of batch.result.entities) {
        if (c.automation === 1) automatedCount++;
      }
      offset += limit;
      if (batch.result.entities.length < limit) break;
    }

    const runs: QaseTestRun[] = runsData.result.entities.map((r) => ({
      id: r.id,
      title: r.title,
      projectCode: code,
      status: r.status === 0 ? "active" : r.status === 1 ? "complete" : "abort",
      startTime: r.start_time,
      endTime: r.end_time ?? undefined,
      stats: {
        total: r.stats?.total ?? 0,
        passed: r.stats?.passed ?? 0,
        failed: r.stats?.failed ?? 0,
        skipped: r.stats?.skipped ?? 0,
        blocked: r.stats?.blocked ?? 0,
      },
    }));

    projects.push({
      projectCode: code,
      projectName: projectData.result.title,
      totalCases,
      automatedCases: automatedCount,
      manualCases: totalCases - automatedCount,
      runs,
    });
  }

  return projects;
}
