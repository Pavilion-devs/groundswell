import { and, desc, eq, inArray, max, min } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Board } from "./boards.js";
import { getActiveCodebook, type Theme } from "./codebook.js";
import { type BriefMetrics, parseBriefBody, type RenderedEvidence, renderBriefMarkdown } from "./briefs.js";
import { parseWeights, rankThemes } from "./priorities.js";
import { noteText, quoteOf } from "./quotes.js";
import { themeStats } from "./theme-stats.js";

/** SQL facts for one theme, as a brief records them. */
export async function briefMetrics(board: Board, theme: Theme, themes: Theme[]): Promise<BriefMetrics> {
  const db = getDb();
  const stats = await themeStats(board.id, themes);
  const ranked = rankThemes(stats, parseWeights(board.priorityWeights));
  const mine = ranked.find((r) => r.themeId === theme.id);
  const [span] = await db
    .select({ first: min(schema.notes.sourceCreatedAt), last: max(schema.notes.sourceCreatedAt) })
    .from(schema.placements)
    .innerJoin(schema.notes, eq(schema.notes.id, schema.placements.noteId))
    .where(and(eq(schema.placements.boardId, board.id), eq(schema.placements.themeId, theme.id)));
  const groups = await db
    .select({ canonical: schema.duplicateGroups.canonicalNoteId })
    .from(schema.duplicateGroups)
    .where(eq(schema.duplicateGroups.boardId, board.id));
  const placed = groups.length
    ? await db
        .select({ noteId: schema.placements.noteId })
        .from(schema.placements)
        .where(and(eq(schema.placements.themeId, theme.id), inArray(schema.placements.noteId, groups.map((g) => g.canonical))))
    : [];
  return {
    notes: mine?.notes ?? 0,
    uniqueProblems: mine?.uniqueProblems ?? 0,
    reporters: mine?.reporters ?? 0,
    engagement: mine?.engagement ?? 0,
    recent: mine?.recent ?? 0,
    rank: mine?.rank ?? null,
    score: mine?.score ?? 0,
    firstReported: span?.first ?? null,
    lastReported: span?.last ?? null,
    duplicateGroups: placed.length,
  };
}

export type BriefRow = typeof schema.briefs.$inferSelect;

/** A brief with its evidence resolved to verbatim quotes and links, plus its Markdown. */
export async function loadBriefView(board: Board, brief: BriefRow) {
  const db = getDb();
  const body = parseBriefBody(brief.body);
  const [theme] = await db.select().from(schema.themes).where(eq(schema.themes.id, brief.themeId)).limit(1);
  const ids = body ? [...new Set(body.evidence.map((e) => e.noteId))] : [];
  const notes = ids.length
    ? await db
        .select({ id: schema.notes.id, title: schema.notes.title, body: schema.notes.body, url: schema.notes.url, author: schema.notes.author })
        .from(schema.notes)
        .where(inArray(schema.notes.id, ids))
    : [];
  const byId = new Map(notes.map((n) => [n.id, n]));
  const evidence: Array<RenderedEvidence & { noteId: string }> = (body?.evidence ?? []).flatMap((e) => {
    const n = byId.get(e.noteId);
    const quote = n ? quoteOf(noteText(n), e.start, e.end) : null;
    return n && quote ? [{ noteId: e.noteId, quote, why: e.why, title: n.title ?? "(untitled)", url: n.url, author: n.author }] : [];
  });
  const metrics = (brief.metrics as BriefMetrics | null) ?? null;
  const title = brief.title ?? theme?.name ?? "Insight Brief";
  const markdown =
    body && metrics
      ? renderBriefMarkdown({ title, themeName: theme?.name ?? "", body, evidence, metrics, boardTitle: board.title })
      : "";
  return {
    id: brief.id,
    themeId: brief.themeId,
    themeName: theme?.name ?? null,
    title,
    problem: body?.problem ?? "",
    impact: body?.impact ?? "",
    nextStep: body?.nextStep ?? "",
    evidence,
    metrics,
    filedIssueUrl: brief.filedIssueUrl,
    filedAt: brief.filedAt,
    createdAt: brief.createdAt,
    markdown,
  };
}

/** The latest brief for a theme key on the active codebook, or a specific brief. */
export async function findBrief(boardId: string, ref: { briefId?: string | undefined; theme?: string | undefined }): Promise<BriefRow | null> {
  const db = getDb();
  if (ref.briefId) {
    const [row] = await db
      .select()
      .from(schema.briefs)
      .where(and(eq(schema.briefs.id, ref.briefId), eq(schema.briefs.boardId, boardId)))
      .limit(1);
    return row ?? null;
  }
  if (!ref.theme) return null;
  const active = await getActiveCodebook(boardId);
  const theme = active?.themes.find((t) => t.id === ref.theme || t.key === ref.theme);
  if (!theme) return null;
  // Briefs belong to a theme id; follow the theme's key back through earlier versions.
  const sameKey = await db.select({ id: schema.themes.id }).from(schema.themes).where(and(eq(schema.themes.boardId, boardId), eq(schema.themes.key, theme.key)));
  const [row] = await db
    .select()
    .from(schema.briefs)
    .where(and(eq(schema.briefs.boardId, boardId), inArray(schema.briefs.themeId, sameKey.map((t) => t.id))))
    .orderBy(desc(schema.briefs.createdAt))
    .limit(1);
  return row ?? null;
}
