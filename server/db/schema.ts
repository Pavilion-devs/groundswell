import { createSharesTable, ownableColumns } from "@agent-native/core/db/schema";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Groundswell data model. Boards are the ownable, shareable resource; every
 * other table is a child scoped by `board_id`, so actions check access to the
 * board before touching children (see the security skill).
 *
 * Timestamps are ISO-8601 text, matching the framework's own tables.
 */

const now = sql`now()`;

/**
 * Child tables carry `owner_email` / `org_id` copied from their board, so the
 * framework's db tools (db-query, db-exec) scope children per user/org too.
 * Actions still check access to the board before touching children.
 */

/** A feedback board: one set of sources, themes and placements. */
export const boards = pgTable("boards", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  /** Tunable priority weights: { volume, reporters, engagement, recency } (see server/lib/priorities.ts). */
  priorityWeights: jsonb("priority_weights"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
  ...ownableColumns(),
});

export const boardShares = createSharesTable("board_shares");

/** Where notes come from: a GitHub repo, a CSV upload, or pasted text. */
export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["github", "csv", "text"] }).notNull(),
    /** Kind-specific config, e.g. { owner, repo, state, includeLabels }. */
    config: jsonb("config").notNull(),
    label: text("label").notNull(),
    lastSyncedAt: text("last_synced_at"),
    /** Import stats: { notes, lastFetched, botsSkipped, truncated, api }. */
    stats: jsonb("stats"),
    createdAt: text("created_at").notNull().default(now),
    // Tenant scope copied from the board (see note at top).
    ownerEmail: text("owner_email").notNull().default("local@localhost"),
    orgId: text("org_id"),
  },
  (t) => [index("sources_board_idx").on(t.boardId)],
);

/** One piece of feedback: a GitHub issue, a CSV row, a pasted paragraph. */
export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    /** Stable id within the source (issue number, row number, hash). */
    externalId: text("external_id").notNull(),
    url: text("url"),
    title: text("title"),
    body: text("body").notNull().default(""),
    author: text("author"),
    authorAvatar: text("author_avatar"),
    reactions: integer("reactions").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    labels: jsonb("labels"),
    /** Source-side state, e.g. "open" / "closed" for GitHub issues. */
    state: text("state"),
    /** When the feedback was written at the source. */
    sourceCreatedAt: text("source_created_at"),
    /** Hash of title + body, used to cache classifications. */
    contentHash: text("content_hash").notNull(),
    createdAt: text("created_at").notNull().default(now),
    // Tenant scope copied from the board (see note at top).
    ownerEmail: text("owner_email").notNull().default("local@localhost"),
    orgId: text("org_id"),
  },
  (t) => [
    uniqueIndex("notes_source_external_idx").on(t.sourceId, t.externalId),
    index("notes_board_idx").on(t.boardId),
  ],
);

/**
 * A versioned set of theme definitions. One `active` codebook per board;
 * the agent's revision proposals are `proposed` until a person approves.
 */
export const codebooks = pgTable(
  "codebooks",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status", {
      enum: ["active", "proposed", "archived", "rejected", "undone"],
    }).notNull(),
    createdBy: text("created_by", { enum: ["agent", "user"] }).notNull(),
    /** Why this version exists (agent summary of the revision). */
    summary: text("summary"),
    /** For proposals: the structured diff against the parent version. */
    diff: jsonb("diff"),
    parentId: text("parent_id"),
    /** When a proposed revision was applied (it became active). */
    appliedAt: text("applied_at"),
    /**
     * Every placement on the board just before this revision was applied
     * (theme by key), so undo can restore the board exactly.
     */
    restoreSnapshot: jsonb("restore_snapshot"),
    createdAt: text("created_at").notNull().default(now),
    // Tenant scope copied from the board (see note at top).
    ownerEmail: text("owner_email").notNull().default("local@localhost"),
    orgId: text("org_id"),
  },
  (t) => [
    uniqueIndex("codebooks_board_version_idx").on(t.boardId, t.version),
    index("codebooks_board_status_idx").on(t.boardId, t.status),
  ],
);

/** A theme on the board. Belongs to a codebook version. */
export const themes = pgTable(
  "themes",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    codebookId: text("codebook_id")
      .notNull()
      .references(() => codebooks.id, { onDelete: "cascade" }),
    /** Stable slug across codebook versions, e.g. "install-errors". */
    key: text("key").notNull(),
    name: text("name").notNull(),
    definition: text("definition").notNull(),
    includeRules: jsonb("include_rules"),
    excludeRules: jsonb("exclude_rules"),
    color: text("color"),
    /**
     * Not product feedback (CI trackers, internal tasks, spam). Kept on the
     * board so Unsorted stays clean, but ranked apart from real problems.
     */
    internal: boolean("internal").notNull().default(false),
    /** Canvas position; null until laid out. */
    x: real("x"),
    y: real("y"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
    // Tenant scope copied from the board (see note at top).
    ownerEmail: text("owner_email").notNull().default("local@localhost"),
    orgId: text("org_id"),
  },
  (t) => [
    index("themes_board_idx").on(t.boardId),
    uniqueIndex("themes_codebook_key_idx").on(t.codebookId, t.key),
  ],
);

/** Where a note sits. A null theme means the Unsorted tray. */
export const placements = pgTable(
  "placements",
  {
    noteId: text("note_id")
      .primaryKey()
      .references(() => notes.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    themeId: text("theme_id").references(() => themes.id, {
      onDelete: "set null",
    }),
    confidence: real("confidence"),
    rationale: text("rationale"),
    /** For low-confidence notes left in Unsorted: the agent's best guess. */
    suggestedThemeId: text("suggested_theme_id"),
    /** Verbatim evidence span in the note text (see noteText() in server/lib/quotes.ts), server-validated. */
    quoteStart: integer("quote_start"),
    quoteEnd: integer("quote_end"),
    /** Pinned placements were made by a person; agent re-sorts skip them. */
    pinned: boolean("pinned").notNull().default(false),
    placedBy: text("placed_by", { enum: ["agent", "user"] }).notNull(),
    /** The run that last moved this note (drives the ripple animation). */
    lastRunId: text("last_run_id"),
    updatedAt: text("updated_at").notNull().default(now),
    // Tenant scope copied from the board (see note at top).
    ownerEmail: text("owner_email").notNull().default("local@localhost"),
    orgId: text("org_id"),
  },
  (t) => [index("placements_board_theme_idx").on(t.boardId, t.themeId)],
);

/** A person moving a note: the signal the agent learns from. */
export const corrections = pgTable(
  "corrections",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    fromThemeId: text("from_theme_id"),
    toThemeId: text("to_theme_id"),
    reason: text("reason"),
    /** Set once a codebook revision has taken this correction into account. */
    consumedByCodebookId: text("consumed_by_codebook_id"),
    createdAt: text("created_at").notNull().default(now),
    // Tenant scope copied from the board (see note at top).
    ownerEmail: text("owner_email").notNull().default("local@localhost"),
    orgId: text("org_id"),
  },
  (t) => [index("corrections_board_idx").on(t.boardId)],
);

/** Groups of near-identical reports inside a theme. */
export const duplicateGroups = pgTable(
  "duplicate_groups",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
    canonicalNoteId: text("canonical_note_id").notNull(),
    memberNoteIds: jsonb("member_note_ids").notNull(),
    summary: text("summary"),
    createdAt: text("created_at").notNull().default(now),
    // Tenant scope copied from the board (see note at top).
    ownerEmail: text("owner_email").notNull().default("local@localhost"),
    orgId: text("org_id"),
  },
  (t) => [index("duplicate_groups_theme_idx").on(t.themeId)],
);

/** An agent-written Insight Brief for one theme. */
export const briefs = pgTable(
  "briefs",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
    /** { problem, impact, evidence: [{ noteId, start, end }], nextStep }. */
    body: jsonb("body").notNull(),
    title: text("title"),
    /** Facts computed in SQL when the brief was saved (counts, reporters, engagement); never written by the model. */
    metrics: jsonb("metrics"),
    filedIssueUrl: text("filed_issue_url"),
    filedAt: text("filed_at"),
    createdAt: text("created_at").notNull().default(now),
    // Tenant scope copied from the board (see note at top).
    ownerEmail: text("owner_email").notNull().default("local@localhost"),
    orgId: text("org_id"),
  },
  (t) => [index("briefs_theme_idx").on(t.themeId)],
);

/** A periodic summary of what changed on a board (written by the weekly digest automation). */
export const digests = pgTable(
  "digests",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    /** The SQL facts the digest was written from. */
    stats: jsonb("stats").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull().default(now),
    // Tenant scope copied from the board (see note at top).
    ownerEmail: text("owner_email").notNull().default("local@localhost"),
    orgId: text("org_id"),
  },
  (t) => [index("digests_board_idx").on(t.boardId, t.createdAt)],
);

/** Long-running agent work (import, codebook, classify, re-sort, ...). */
export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["import", "codebook", "classify", "revise", "resort", "dedupe", "brief"],
    }).notNull(),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    progress: integer("progress").notNull().default(0),
    total: integer("total"),
    error: text("error"),
    meta: jsonb("meta"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at").notNull().default(now),
    // Tenant scope copied from the board (see note at top).
    ownerEmail: text("owner_email").notNull().default("local@localhost"),
    orgId: text("org_id"),
  },
  (t) => [index("runs_board_idx").on(t.boardId, t.createdAt)],
);
