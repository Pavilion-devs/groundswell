import {
  ensureAdditiveColumns,
  getDbExec,
  runMigrations,
} from "@agent-native/core/db";

import * as schema from "../db/schema.js";

function isDrizzleTable(value: unknown): value is object {
  return (
    !!value &&
    typeof value === "object" &&
    Object.getOwnPropertySymbols(value).some((s) =>
      s.toString().includes("drizzle"),
    )
  );
}

const schemaTables = Object.values(schema).filter(isDrizzleTable);

// Every migration needs a unique, stable `name`. Append new entries; never
// edit or renumber an applied one. Migrations must stay additive.
export const runGroundswellMigrations = runMigrations(
  [
    {
      version: 1,
      name: "groundswell-initial-schema",
      sql: {
        postgres: `
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority_weights JSONB,
  created_at TEXT NOT NULL DEFAULT (now()),
  updated_at TEXT NOT NULL DEFAULT (now()),
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  org_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
);

CREATE TABLE IF NOT EXISTS board_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now())
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  config JSONB NOT NULL,
  label TEXT NOT NULL,
  last_synced_at TEXT,
  stats JSONB,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS sources_board_idx ON sources (board_id);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  url TEXT,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  author TEXT,
  author_avatar TEXT,
  reactions INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  labels JSONB,
  state TEXT,
  source_created_at TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE UNIQUE INDEX IF NOT EXISTS notes_source_external_idx ON notes (source_id, external_id);
CREATE INDEX IF NOT EXISTS notes_board_idx ON notes (board_id);

CREATE TABLE IF NOT EXISTS codebooks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  summary TEXT,
  diff JSONB,
  parent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE UNIQUE INDEX IF NOT EXISTS codebooks_board_version_idx ON codebooks (board_id, version);
CREATE INDEX IF NOT EXISTS codebooks_board_status_idx ON codebooks (board_id, status);

CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  codebook_id TEXT NOT NULL REFERENCES codebooks(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  definition TEXT NOT NULL,
  include_rules JSONB,
  exclude_rules JSONB,
  color TEXT,
  x REAL,
  y REAL,
  created_at TEXT NOT NULL DEFAULT (now()),
  updated_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS themes_board_idx ON themes (board_id);
CREATE UNIQUE INDEX IF NOT EXISTS themes_codebook_key_idx ON themes (codebook_id, key);

CREATE TABLE IF NOT EXISTS placements (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  theme_id TEXT REFERENCES themes(id) ON DELETE SET NULL,
  confidence REAL,
  rationale TEXT,
  quote_start INTEGER,
  quote_end INTEGER,
  pinned BOOLEAN NOT NULL DEFAULT false,
  placed_by TEXT NOT NULL,
  last_run_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS placements_board_theme_idx ON placements (board_id, theme_id);

CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  from_theme_id TEXT,
  to_theme_id TEXT,
  reason TEXT,
  consumed_by_codebook_id TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS corrections_board_idx ON corrections (board_id);

CREATE TABLE IF NOT EXISTS duplicate_groups (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  canonical_note_id TEXT NOT NULL,
  member_note_ids JSONB NOT NULL,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS duplicate_groups_theme_idx ON duplicate_groups (theme_id);

CREATE TABLE IF NOT EXISTS briefs (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  body JSONB NOT NULL,
  filed_issue_url TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS briefs_theme_idx ON briefs (theme_id);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  total INTEGER,
  error TEXT,
  meta JSONB,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS runs_board_idx ON runs (board_id, created_at);
`,
      },
    },
    {
      // Tenant scope on child tables so the framework's db tools scope them.
      version: 2,
      name: "groundswell-child-tenant-scope",
      sql: {
        postgres: ["sources", "notes", "codebooks", "themes", "placements", "corrections", "duplicate_groups", "briefs", "runs"]
          .map(
            (t) => `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS owner_email TEXT NOT NULL DEFAULT 'local@localhost';
ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS org_id TEXT;
CREATE INDEX IF NOT EXISTS ${t}_owner_idx ON ${t} (owner_email);`,
          )
          .join("\n"),
      },
    },
    {
      version: 3,
      name: "groundswell-placement-suggestion",
      sql: {
        postgres: `ALTER TABLE placements ADD COLUMN IF NOT EXISTS suggested_theme_id TEXT;`,
      },
    },
  ],
  { table: "groundswell_migrations" },
);

/**
 * Nitro plugin: run Groundswell's migrations, then add any column that exists
 * in schema.ts but not yet in the database (additive only, never fails boot).
 */
export default async (nitroApp: any): Promise<void> => {
  await runGroundswellMigrations(nitroApp);
  try {
    const summary = await ensureAdditiveColumns({
      db: getDbExec(),
      tables: schemaTables,
    });
    if (summary.errors.length > 0) {
      console.warn(
        "[db] ensureAdditiveColumns completed with errors:",
        summary.errors,
      );
    }
  } catch (err) {
    console.warn(
      "[db] ensureAdditiveColumns failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
};
