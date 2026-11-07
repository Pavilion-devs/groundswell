import { and, count, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

/** Below this confidence a note stays in Unsorted, with the guess kept as a suggestion. */
export const CONFIDENCE_FLOOR = 0.5;

/**
 * What a sort run covers:
 * - "new": notes never placed.
 * - "unsorted": those plus notes the agent left in Unsorted (never pinned ones),
 *   used after adding themes to cover gaps.
 */
export type SortScope = "new" | "unsorted";

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
export function sortPool(boardId: string, scope: SortScope, runId: string | null): SQL | undefined {
  const p = schema.placements;
  const onBoard = eq(schema.notes.boardId, boardId);
  if (scope === "new") return and(onBoard, isNull(p.noteId));
  const notThisRun = runId ? or(isNull(p.lastRunId), ne(p.lastRunId, runId)) : undefined;
  return and(onBoard, or(isNull(p.noteId), and(isNull(p.themeId), eq(p.pinned, false), notThisRun)));
}

export async function countPool(
  boardId: string,
  scope: SortScope,
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
  return (meta as { scope?: unknown } | null)?.scope === "unsorted" ? "unsorted" : "new";
}
