import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export type DB = DatabaseSync;

export function openDb(dbPath: string): DB {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name  TEXT NOT NULL,
      color         TEXT NOT NULL DEFAULT '#7c5cff',
      password_hash TEXT NOT NULL,
      pin_hash      TEXT,
      data_key      TEXT NOT NULL,            -- user data key, wrapped by master key
      quota_bytes   INTEGER,                  -- NULL = share of total pool
      is_owner      INTEGER NOT NULL DEFAULT 0,
      pin_attempts  INTEGER NOT NULL DEFAULT 0,
      locked_until  INTEGER NOT NULL DEFAULT 0,
      last_sync_at  INTEGER,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      token_hash  TEXT NOT NULL,
      last_seen   INTEGER,
      created_at  INTEGER NOT NULL
    );

    -- A blob is one immutable encrypted file content (a set of chunk files on disk).
    CREATE TABLE IF NOT EXISTS blobs (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      size        INTEGER NOT NULL,
      chunk_count INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path       TEXT NOT NULL,               -- normalized, e.g. "projects/site/index.html"
      name       TEXT NOT NULL,
      is_dir     INTEGER NOT NULL DEFAULT 0,
      blob_id    TEXT REFERENCES blobs(id),
      size       INTEGER NOT NULL DEFAULT 0,
      mime       TEXT NOT NULL DEFAULT 'application/octet-stream',
      category   TEXT NOT NULL DEFAULT 'files',  -- files | media | apps | projects
      mtime      INTEGER,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER                       -- soft delete = trash
    );
    CREATE UNIQUE INDEX IF NOT EXISTS files_user_path
      ON files(user_id, path) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS files_user_parent ON files(user_id, path);

    CREATE TABLE IF NOT EXISTS versions (
      id         TEXT PRIMARY KEY,
      file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      blob_id    TEXT NOT NULL REFERENCES blobs(id),
      size       INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path       TEXT NOT NULL,
      size       INTEGER NOT NULL,
      chunk_size INTEGER NOT NULL,
      blob_id    TEXT NOT NULL,
      category   TEXT,
      mtime      INTEGER,
      status     TEXT NOT NULL DEFAULT 'active',   -- active | done | aborted
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS upload_chunks (
      upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
      idx       INTEGER NOT NULL,
      PRIMARY KEY (upload_id, idx)
    );

    CREATE TABLE IF NOT EXISTS apps (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
      root_path  TEXT NOT NULL,                -- folder (or single file) inside the user's storage
      visibility TEXT NOT NULL DEFAULT 'private',  -- private | public
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Full-text index over file names and (for text files) their contents.
    -- 'external content' would need the row ids to line up with files.rowid; keeping
    -- it standalone lets us reindex a single path without touching the rest.
    CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(
      file_id UNINDEXED,
      user_id UNINDEXED,
      path,
      body,
      tokenize = "unicode61 remove_diacritics 2"
    );
  `);

  // --- migrations (safe to re-run) ---
  addColumn(db, 'users', 'pw_attempts', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'users', 'pw_locked_until', 'INTEGER NOT NULL DEFAULT 0');

  return db;
}

/** ALTER TABLE ADD COLUMN, but a no-op when the column is already there. */
function addColumn(db: DB, table: string, column: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

export const now = () => Date.now();
