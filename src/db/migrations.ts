import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      kind          TEXT    NOT NULL CHECK (kind IN ('original', 'repost')),
      commentary    TEXT    NOT NULL DEFAULT '',
      source_url    TEXT,
      source_urn    TEXT,
      media_json    TEXT,
      status        TEXT    NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','queued','scheduled','publishing','published','failed')),
      scheduled_for TEXT,
      slot_id       INTEGER REFERENCES schedule_slots(id) ON DELETE SET NULL,
      published_urn TEXT,
      published_at  TEXT,
      error         TEXT,
      retry_count   INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedule_slots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      time_local   TEXT    NOT NULL,
      timezone     TEXT    NOT NULL DEFAULT 'America/Chicago',
      enabled      INTEGER NOT NULL DEFAULT 1
    );

    -- Single-row table enforced by CHECK (id = 1) + INSERT OR REPLACE
    CREATE TABLE IF NOT EXISTS linkedin_auth (
      id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      access_token  TEXT NOT NULL,
      refresh_token TEXT,
      expires_at    TEXT NOT NULL,
      member_urn    TEXT NOT NULL
    );

    CREATE TRIGGER IF NOT EXISTS posts_updated_at
      AFTER UPDATE ON posts
      BEGIN
        UPDATE posts SET updated_at = datetime('now') WHERE id = NEW.id;
      END;
  `);
}
