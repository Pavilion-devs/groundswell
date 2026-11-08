import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Theme } from "./codebook.js";
import { noteText } from "./quotes.js";
import type { DiffEntry, ParentTheme } from "./revisions.js";
import { asStringArray } from "./themes.js";

export interface CorrectionView {
  id: string;
  noteId: string;
  noteTitle: string;
  excerpt: string;
  from: { key: string; name: string } | null;
  to: { key: string; name: string } | null;
  reason: string | null;
  createdAt: string;
  consumedByCodebookId: string | null;
}

/** Theme key and name for any theme id, from any codebook version. */
export async function themeLabels(ids: Array<string | null>): Promise<Map<string, { key: string; name: string }>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return new Map();
  const rows = await getDb()
    .select({ id: schema.themes.id, key: schema.themes.key, name: schema.themes.name })
    .from(schema.themes)
    .where(inArray(schema.themes.id, wanted));
  return new Map(rows.map((r) => [r.id, { key: r.key, name: r.name }]));
}

/** Corrections on a board, newest first, with the note and both themes resolved. */
export async function loadCorrections(
  boardId: string,
  opts: { pendingOnly?: boolean; ids?: string[]; limit?: number } = {},
): Promise<CorrectionView[]> {
  const c = schema.corrections;
  const where = and(
    eq(c.boardId, boardId),
    opts.pendingOnly ? isNull(c.consumedByCodebookId) : undefined,
    opts.ids ? inArray(c.id, opts.ids.length ? opts.ids : ["-"]) : undefined,
  );
  const rows = await getDb()
    .select({
      id: c.id,
      noteId: c.noteId,
      fromThemeId: c.fromThemeId,
      toThemeId: c.toThemeId,
      reason: c.reason,
      createdAt: c.createdAt,
      consumedByCodebookId: c.consumedByCodebookId,
      title: schema.notes.title,
      body: schema.notes.body,
    })
    .from(c)
    .innerJoin(schema.notes, eq(schema.notes.id, c.noteId))
    .where(where)
    .orderBy(desc(c.createdAt))
    .limit(opts.limit ?? 200);
  const labels = await themeLabels(rows.flatMap((r) => [r.fromThemeId, r.toThemeId]));
  return rows.map((r) => {
    const text = noteText(r);
    return {
      id: r.id,
      noteId: r.noteId,
      noteTitle: r.title ?? "(untitled)",
      excerpt: text.length > 400 ? `${text.slice(0, 400).trimEnd()}…` : text,
      from: r.fromThemeId ? (labels.get(r.fromThemeId) ?? null) : null,
      to: r.toThemeId ? (labels.get(r.toThemeId) ?? null) : null,
      reason: r.reason,
      createdAt: r.createdAt,
      consumedByCodebookId: r.consumedByCodebookId,
    };
  });
}

export async function countPendingCorrections(boardId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(schema.corrections)
    .where(and(eq(schema.corrections.boardId, boardId), isNull(schema.corrections.consumedByCodebookId)));
  return Number(row?.n ?? 0);
}

export function toParentThemes(themes: Theme[]): ParentTheme[] {
  return themes.map((t) => ({
    key: t.key,
    name: t.name,
    definition: t.definition,
    includeRules: asStringArray(t.includeRules),
    excludeRules: asStringArray(t.excludeRules),
    color: t.color,
    x: t.x,
    y: t.y,
  }));
}

/**
 * Theme keys whose notes a revision should re-check: every theme it changed or
 * added, plus the themes its corrections moved notes out of and into (that is
 * where the agent's understanding was wrong).
 */
export function touchedKeys(entries: DiffEntry[], corrections: CorrectionView[]): Set<string> {
  const keys = new Set<string>();
  for (const e of entries) if (e.op !== "remove") keys.add(e.key);
  for (const c of corrections) {
    if (c.from) keys.add(c.from.key);
    if (c.to) keys.add(c.to.key);
  }
  return keys;
}
