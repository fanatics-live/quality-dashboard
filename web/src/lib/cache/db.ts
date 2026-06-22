import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "cache.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS source_snapshots (
      source    TEXT PRIMARY KEY,
      data      TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    )
  `);

  return _db;
}
