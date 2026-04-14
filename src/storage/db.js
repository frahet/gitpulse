import Database from 'better-sqlite3';
import { resolve } from 'path';

const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), 'data/gitpulse.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    migrate(db);
  }
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      style     TEXT    NOT NULL,
      provider  TEXT    NOT NULL,
      model     TEXT    NOT NULL,
      stats     TEXT    NOT NULL,
      summary   TEXT,
      full_data TEXT    NOT NULL,
      created_at TEXT   NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS reports_created_at ON reports(created_at DESC);
  `);
}

export function saveReport({ style, provider, model, stats, summary, fullData }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO reports (style, provider, model, stats, summary, full_data)
    VALUES (@style, @provider, @model, @stats, @summary, @full_data)
  `);
  const result = stmt.run({
    style,
    provider,
    model,
    stats: JSON.stringify(stats),
    summary: summary ? JSON.stringify(summary) : null,
    full_data: JSON.stringify(fullData),
  });
  return result.lastInsertRowid;
}

export function listReports(limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT id, style, provider, model, stats, summary, created_at
    FROM reports ORDER BY created_at DESC LIMIT ?
  `).all(limit).map(deserializeReport);
}

export function getReport(id) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM reports WHERE id = ?`).get(id);
  if (!row) return null;
  return { ...deserializeReport(row), fullData: JSON.parse(row.full_data) };
}

function deserializeReport(row) {
  return {
    ...row,
    stats: JSON.parse(row.stats),
    summary: row.summary ? JSON.parse(row.summary) : null,
  };
}
