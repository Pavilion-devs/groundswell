import { and, count, eq, isNotNull, max, sql } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Theme } from "./codebook.js";
import { RECENT_DAYS, type ThemeStats } from "./priorities.js";

/** The board's newest note date: "recent" is measured from here, so scores are stable over time. */
export async function boardReferenceDate(boardId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ newest: max(schema.notes.sourceCreatedAt) })
    .from(schema.notes)
    .where(eq(schema.notes.boardId, boardId));
  return row?.newest ?? null;
}

/** Per-theme facts for the active codebook's themes, all from SQL. */
export async function themeStats(boardId: string, themes: Theme[]): Promise<ThemeStats[]> {
  const db = getDb();
  const reference = await boardReferenceDate(boardId);
  const recentSince = reference ? new Date(Date.parse(reference) - RECENT_DAYS * 86_400_000).toISOString() : null;
  const p = schema.placements;
  const n = schema.notes;
  const rows = await db
    .select({
      themeId: p.themeId,
      notes: count(),
      // A note without an author counts as its own reporter.
      reporters: sql<number>`count(distinct coalesce(${n.author}, ${n.id}))`,
      engagement: sql<number>`coalesce(sum(${n.comments} + 2 * ${n.reactions}), 0)`,
      recent: recentSince ? sql<number>`count(*) filter (where ${n.sourceCreatedAt} >= ${recentSince})` : sql<number>`0`,
    })
    .from(p)
    .innerJoin(n, eq(n.id, p.noteId))
    .where(and(eq(p.boardId, boardId), isNotNull(p.themeId)))
    .groupBy(p.themeId);
  const byTheme = new Map(rows.map((r) => [r.themeId, r]));
  const extraByTheme = await duplicateExtras(boardId);
  return themes.map((t) => {
    const r = byTheme.get(t.id);
    const notes = Number(r?.notes ?? 0);
    return {
      themeId: t.id,
      key: t.key,
      name: t.name,
      internal: t.internal,
      notes,
      uniqueProblems: Math.max(0, notes - (extraByTheme.get(t.id) ?? 0)),
      reporters: Number(r?.reporters ?? 0),
      engagement: Number(r?.engagement ?? 0),
      recent: Number(r?.recent ?? 0),
    };
  });
}

/**
 * For each theme, how many notes are extra copies of a problem already counted:
 * members of a duplicate group that currently sit in the same theme as the
 * group's canonical note. Uses where notes are now, so it survives codebook
 * revisions (theme ids change per version).
 */
export async function duplicateExtras(boardId: string): Promise<Map<string, number>> {
  const db = getDb();
  const groups = await db
    .select({ canonical: schema.duplicateGroups.canonicalNoteId, members: schema.duplicateGroups.memberNoteIds })
    .from(schema.duplicateGroups)
    .where(eq(schema.duplicateGroups.boardId, boardId));
  if (!groups.length) return new Map();
  const placed = await db
    .select({ noteId: schema.placements.noteId, themeId: schema.placements.themeId })
    .from(schema.placements)
    .where(eq(schema.placements.boardId, boardId));
  const themeOf = new Map(placed.map((p) => [p.noteId, p.themeId]));
  const extra = new Map<string, number>();
  for (const g of groups) {
    const home = themeOf.get(g.canonical);
    if (!home) continue;
    const members = Array.isArray(g.members) ? (g.members as string[]) : [];
    const same = members.filter((m) => m !== g.canonical && themeOf.get(m) === home).length;
    if (same) extra.set(home, (extra.get(home) ?? 0) + same);
  }
  return extra;
}
