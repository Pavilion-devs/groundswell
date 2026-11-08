import { and, count, eq, gte, isNull, lte, ne, or, type AnyColumn } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Board } from "./boards.js";
import { getActiveCodebook } from "./codebook.js";
import { parseWeights, rankThemes } from "./priorities.js";
import { themeStats } from "./theme-stats.js";

export interface DigestStats {
  periodStart: string;
  periodEnd: string;
  /** Feedback written at the source during the period. */
  newFeedback: number;
  /** Notes that arrived on the board during the period (imports and webhooks). */
  arrivedOnBoard: number;
  byTheme: Array<{ name: string; newFeedback: number; internal: boolean }>;
  newUnsorted: number;
  revisionsApplied: Array<{ version: number; summary: string | null; appliedAt: string }>;
  correctionsMade: number;
  briefsWritten: Array<{ title: string; filedIssueUrl: string | null }>;
  topPriorities: Array<{ rank: number; name: string; score: number; notes: number; reporters: number }>;
  unsortedNow: number;
}

/** Everything a digest says, counted in SQL for the period ending at `end`. */
export async function digestStats(board: Board, days: number, end = new Date()): Promise<DigestStats> {
  const db = getDb();
  const periodEnd = end.toISOString();
  const periodStart = new Date(end.getTime() - days * 86_400_000).toISOString();
  const n = schema.notes;
  const p = schema.placements;
  const inPeriod = (col: AnyColumn) => and(gte(col, periodStart), lte(col, periodEnd));
  // A note is unsorted when it has no placement yet or sits in the Unsorted tray.
  const unsorted = or(isNull(p.noteId), isNull(p.themeId));

  const active = await getActiveCodebook(board.id);
  const themes = active?.themes ?? [];
  const [newRows, [arrived], [newUnsorted], codebooks, [corrections], briefs, [unsortedNow]] = await Promise.all([
    db
      .select({ themeId: p.themeId, n: count() })
      .from(n)
      .leftJoin(p, eq(p.noteId, n.id))
      .where(and(eq(n.boardId, board.id), inPeriod(n.sourceCreatedAt)))
      .groupBy(p.themeId),
    db.select({ n: count() }).from(n).where(and(eq(n.boardId, board.id), inPeriod(n.createdAt))),
    db
      .select({ n: count() })
      .from(n)
      .leftJoin(p, eq(p.noteId, n.id))
      .where(and(eq(n.boardId, board.id), inPeriod(n.createdAt), unsorted)),
    db
      .select({ version: schema.codebooks.version, summary: schema.codebooks.summary, appliedAt: schema.codebooks.appliedAt })
      .from(schema.codebooks)
      // An undone revision did not stick; it is not news.
      .where(and(eq(schema.codebooks.boardId, board.id), inPeriod(schema.codebooks.appliedAt), ne(schema.codebooks.status, "undone"))),
    db.select({ n: count() }).from(schema.corrections).where(and(eq(schema.corrections.boardId, board.id), inPeriod(schema.corrections.createdAt))),
    db
      .select({ title: schema.briefs.title, filedIssueUrl: schema.briefs.filedIssueUrl })
      .from(schema.briefs)
      .where(and(eq(schema.briefs.boardId, board.id), inPeriod(schema.briefs.createdAt))),
    db.select({ n: count() }).from(n).leftJoin(p, eq(p.noteId, n.id)).where(and(eq(n.boardId, board.id), unsorted)),
  ]);

  const name = new Map(themes.map((t) => [t.id, t]));
  const byTheme = newRows
    .filter((r) => r.themeId && name.has(r.themeId))
    .map((r) => ({ name: name.get(r.themeId!)!.name, newFeedback: Number(r.n), internal: name.get(r.themeId!)!.internal }))
    .sort((a, b) => b.newFeedback - a.newFeedback);
  const ranked = rankThemes(await themeStats(board.id, themes), parseWeights(board.priorityWeights));

  return {
    periodStart,
    periodEnd,
    newFeedback: newRows.reduce((s, r) => s + Number(r.n), 0),
    arrivedOnBoard: Number(arrived?.n ?? 0),
    byTheme,
    newUnsorted: Number(newUnsorted?.n ?? 0),
    revisionsApplied: codebooks.map((c) => ({ version: c.version, summary: c.summary, appliedAt: c.appliedAt ?? "" })),
    correctionsMade: Number(corrections?.n ?? 0),
    briefsWritten: briefs.map((b) => ({ title: b.title ?? "Insight Brief", filedIssueUrl: b.filedIssueUrl })),
    topPriorities: ranked
      .filter((r) => r.rank !== null)
      .slice(0, 5)
      .map((r) => ({ rank: r.rank ?? 0, name: r.name, score: r.score, notes: r.notes, reporters: r.reporters })),
    unsortedNow: Number(unsortedNow?.n ?? 0),
  };
}
