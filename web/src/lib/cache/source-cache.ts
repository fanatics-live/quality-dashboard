import { getDb } from "./db";

const SOURCE_TTL: Record<string, number> = {
  linear: 30 * 60_000,
  incident: 30 * 60_000,
  qase: 6 * 3600_000,
  datadog: 10 * 60_000,
};

interface CachedRow {
  source: string;
  data: string;
  fetched_at: number;
}

export function getCachedSource(source: string): { data: string; fetchedAt: number } | null {
  const db = getDb();
  const row = db.prepare("SELECT data, fetched_at FROM source_snapshots WHERE source = ?").get(source) as CachedRow | undefined;
  if (!row) return null;
  return { data: row.data, fetchedAt: row.fetched_at };
}

export function setCachedSource(source: string, data: string): void {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO source_snapshots (source, data, fetched_at) VALUES (?, ?, ?)").run(source, data, Date.now());
}

export function isSourceFresh(source: string): boolean {
  const cached = getCachedSource(source);
  if (!cached) return false;
  const ttl = SOURCE_TTL[source] ?? 30 * 60_000;
  return Date.now() - cached.fetchedAt < ttl;
}

export function getOldestFetchedAt(): number | null {
  const db = getDb();
  const row = db.prepare("SELECT MIN(fetched_at) as oldest FROM source_snapshots").get() as { oldest: number | null } | undefined;
  return row?.oldest ?? null;
}

export function clearAllCache(): void {
  const db = getDb();
  db.prepare("DELETE FROM source_snapshots").run();
}

export function hasAnyStaleSources(): boolean {
  for (const source of ["linear", "incident", "qase", "datadog"]) {
    if (!isSourceFresh(source)) return true;
  }
  return false;
}
