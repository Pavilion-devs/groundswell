import { and, count, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

/** Below this confidence a note stays in Unsorted, with the guess kept as a suggestion. */
export const CONFIDENCE_FLOOR = 0.5;

/**
 * What a sort run covers:
 * - "new": notes never placed.
 * - "unsorted": those plus notes the agent left in Unsorted (never pinned ones),
 *   used after adding themes to cover gaps.
 * - "revision": those plus unpinned notes in the themes a codebook revision
 *   touched (`themeIds`), used to re-sort after a revision is applied.
 */
export type SortScope = "new" | "unsorted" | "revision";

/** What a run covers: its scope, plus the touched themes for a revision re-sort. */
export interface PoolSpec {
  scope: SortScope;
  themeIds?: string[];
}

/**
 * Stable partition of a board's notes into `of` slices. Each sorter agent owns
 * one slice, so parallel sorters never pick up the same note.
 */
export function inSlice(slice: number, of: number): SQL {
  return sql`mod(abs(hashtext(${schema.notes.id})), ${of}) = ${slice}`;
}

/**
 * The notes a run still has to look at. A note this run already processed
 * leaves the pool even if it went back to Unsorted, so every run terminates.
 * Use with notes LEFT JOIN placements.
 */
export function sortPool(boardId: string, spec: SortScope | PoolSpec, runId: string | null): SQL | undefined {
  const { scope, themeIds = [] } = typeof spec === "string" ? { scope: spec } : spec;
  const p = schema.placements;
  const onBoard = eq(schema.notes.boardId, boardId);
  if (scope === "new") return and(onBoard, isNull(p.noteId));
  const notThisRun = runId ? or(isNull(p.lastRunId), ne(p.lastRunId, runId)) : undefined;
  const reSortable =
    scope === "revision" && themeIds.length > 0 ? or(isNull(p.themeId), inArray(p.themeId, themeIds)) : isNull(p.themeId);
  return and(onBoard, or(isNull(p.noteId), and(reSortable, eq(p.pinned, false), notThisRun)));
}

export async function countPool(
  boardId: string,
  scope: SortScope | PoolSpec,
  runId: string | null,
  slice?: { slice: number; of: number },
): Promise<number> {
  const pool = sortPool(boardId, scope, runId);
  const [row] = await getDb()
    .select({ n: count() })
    .from(schema.notes)
    .leftJoin(schema.placements, eq(schema.placements.noteId, schema.notes.id))
    .where(slice ? and(pool, inSlice(slice.slice, slice.of)) : pool);
  return Number(row?.n ?? 0);
}

/** Notes on the board that have never been placed. */
export function countNotYetSorted(boardId: string, slice?: { slice: number; of: number }): Promise<number> {
  return countPool(boardId, "new", null, slice);
}

/** A sort run's scope, read from its meta (older runs default to "new"). */
export function scopeOf(meta: unknown): SortScope {
  const scope = (meta as { scope?: unknown } | null)?.scope;
  return scope === "unsorted" || scope === "revision" ? scope : "new";
}

/** A run's full pool spec (scope plus touched themes), read from its meta. */
export function poolOf(meta: unknown): PoolSpec {
  const themeIds = (meta as { themeIds?: unknown } | null)?.themeIds;
  return {
    scope: scopeOf(meta),
    themeIds: Array.isArray(themeIds) ? themeIds.filter((t): t is string => typeof t === "string") : [],
  };
}

/**
 * Split a pool into slices and say what the orchestrating agent does next.
 * Shared by start-sort-run and apply-codebook-revision; the instruction lives
 * in the result because models follow what is in front of them.
 */
export function sortPlan(total: number, requestedSlices: number): { of: number; mode: "solo" | "team" } {
  // Small pools don't need many sorters: aim for at least ~40 notes each.
  const of = Math.max(1, Math.min(requestedSlices, Math.ceil(total / 40)));
  return { of, mode: of === 1 ? "solo" : "team" };
}

export function sortNextStep(runId: string, total: number, of: number, mode: "solo" | "team"): string {
  return mode === "solo"
    ? `Sort these ${total} notes yourself: loop get-notes-for-sorting(boardId, runId ${runId}, slice 0, of 1) then place-notes until remaining is 0. Then call finish-sort-run(runId).`
    : `Spawn exactly ${of} theme-sorter sub-agents now, in this turn: ${of} agent-teams calls with action "spawn" and agent "theme-sorter", one per slice (slice 0 to ${of - 1}, of ${of}), each given the sorterBrief plus its slice and of. Do not call get-notes-for-sorting or place-notes yourself in a team run. Then check agent-teams status until every sorter is completed or errored, and call finish-sort-run(runId).`;
}

/** The brief every sorter sub-agent gets, built the same way wherever a run is started or resumed. */
export function sorterBrief(boardId: string, runId: string, version: number, scope: SortScope): string {
  const why =
    scope === "unsorted"
      ? " (re-sorting Unsorted after new themes were added)"
      : scope === "revision"
        ? " (just revised from the user's corrections; read the updated definitions and exclude rules carefully)"
        : "";
  return `${scope === "revision" ? "Re-sort" : "Sort"} board ${boardId}, run ${runId}, codebook v${version}${why}. For your slice: loop get-notes-for-sorting(boardId, runId, slice, of) then place-notes(boardId, runId, placements) until remaining is 0. Every themed placement needs an exact quote; resend any note listed in quoteMisses.`;
}
