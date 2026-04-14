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

    CREATE TABLE IF NOT EXISTS repo_contexts (
      repo         TEXT PRIMARY KEY,
      context      TEXT NOT NULL,
      source       TEXT NOT NULL DEFAULT 'auto',  -- 'auto' | 'manual'
      model        TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
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

// Returns the most recent saved report for a given style from today (UTC date).
// Used to serve from DB instead of calling the AI API again.
export function getTodaysReport(style) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10); // "2026-04-14"
  const row = db.prepare(`
    SELECT * FROM reports
    WHERE style = ? AND date(created_at) = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(style, today);
  if (!row) return null;
  return { ...deserializeReport(row), fullData: JSON.parse(row.full_data) };
}

export function saveRepoContext({ repo, context, source = 'auto', model = null }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO repo_contexts (repo, context, source, model, generated_at)
    VALUES (@repo, @context, @source, @model, datetime('now'))
    ON CONFLICT(repo) DO UPDATE SET
      context      = excluded.context,
      source       = excluded.source,
      model        = excluded.model,
      generated_at = excluded.generated_at
  `).run({ repo, context, source, model });
}

export function getRepoContext(repo) {
  const db = getDb();
  return db.prepare(`SELECT * FROM repo_contexts WHERE repo = ?`).get(repo) ?? null;
}

export function listRepoContexts() {
  const db = getDb();
  return db.prepare(`SELECT * FROM repo_contexts ORDER BY repo`).all();
}

// Deletes all reports saved today — called on manual refresh so the next
// summary request calls the AI API fresh instead of returning the cached version.
export function clearTodaysReports() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`DELETE FROM reports WHERE date(created_at) = ?`).run(today);
}

function deserializeReport(row) {
  return {
    ...row,
    stats: JSON.parse(row.stats),
    summary: row.summary ? JSON.parse(row.summary) : null,
  };
}
