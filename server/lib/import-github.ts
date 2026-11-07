import { eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Board } from "./boards.js";
import { touchBoard } from "./boards.js";
import { fetchRepoIssues } from "./github.js";
import { nowIso } from "./ids.js";
import { upsertNotes } from "./notes.js";
import { failRun, setRunProgress, startRun, succeedRun } from "./runs.js";
import { getGithubToken } from "./secrets.js";

export type Source = typeof schema.sources.$inferSelect;

export interface GithubSourceConfig {
  owner: string;
  repo: string;
  state: "open" | "closed" | "all";
  maxIssues: number;
  excludeBots: boolean;
}

export interface ImportResult {
  runId: string;
  fetched: number;
  inserted: number;
  updated: number;
  botsSkipped: number;
  truncated: boolean;
  incremental: boolean;
  api: "graphql" | "search";
}

/**
 * Pull a GitHub source's issues into notes, tracking progress in a run.
 * The first sync fetches everything (up to maxIssues); later syncs only fetch
 * issues updated since the last successful sync.
 */
export async function importGithubSource(board: Board, source: Source, opts: { full?: boolean } = {}): Promise<ImportResult> {
  const config = source.config as GithubSourceConfig;
  const since = opts.full ? null : source.lastSyncedAt;
  const runMeta = { sourceId: source.id, repo: `${config.owner}/${config.repo}`, since };
  const runId = await startRun(board, "import", runMeta);
  const startedAt = nowIso();
  try {
    const token = await getGithubToken();
    const fetched = await fetchRepoIssues({
      owner: config.owner,
      repo: config.repo,
      state: config.state,
      since,
      token,
      max: config.maxIssues,
      excludeBots: config.excludeBots ?? true,
      onPage: ({ kept }) => setRunProgress(runId, kept),
    });
    const stats = await upsertNotes(board, source.id, fetched.notes);
    const result: ImportResult = {
      runId,
      fetched: fetched.notes.length,
      inserted: stats.inserted,
      updated: stats.updated,
      botsSkipped: fetched.botsSkipped,
      truncated: fetched.truncated,
      incremental: since !== null,
      api: fetched.api,
    };
    const previous = (source.stats as Record<string, number> | null) ?? {};
    await getDb()
      .update(schema.sources)
      .set({
        lastSyncedAt: startedAt,
        stats: {
          notes: (previous.notes ?? 0) + stats.inserted,
          lastFetched: fetched.notes.length,
          botsSkipped: fetched.botsSkipped,
          truncated: fetched.truncated,
          api: fetched.api,
        },
      })
      .where(eq(schema.sources.id, source.id));
    await touchBoard(board.id);
    await setRunProgress(runId, fetched.notes.length, fetched.notes.length);
    await succeedRun(runId, { ...runMeta, ...result });
    return result;
  } catch (err) {
    await failRun(runId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
