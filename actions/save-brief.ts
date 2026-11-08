import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { briefMetrics, loadBriefView } from "../server/lib/brief-data.js";
import type { BriefBody } from "../server/lib/briefs.js";
import { requireBoard, tenantOf, touchBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { newId, nowIso } from "../server/lib/ids.js";
import { findQuote, MAX_QUOTE_CHARS, noteText } from "../server/lib/quotes.js";
import { resolveThemeRef } from "../server/lib/themes.js";

const errors = defineActionErrors("no_codebook", "theme_not_found", "internal_theme", "invalid_evidence");

export default defineAction({
  description:
    "Save an Insight Brief for a theme: a title, the problem and its impact in plain words, 3-6 evidence quotes, and one suggested next step. Every quote must be copied exactly from a note in the theme; if any is not verbatim nothing is saved and the misses come back so you can fix them. Facts (counts, reporters, engagement, rank) are computed by the server and attached to the brief, so do not put numbers in the prose. Returns the brief and its Markdown.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    theme: z.string().describe("Theme id (thm_...) or key"),
    title: z.string().trim().min(8).max(120).describe("Issue-style title naming the problem, e.g. \"Self-hosted sign-in fails after OAuth redirect\""),
    problem: z.string().trim().min(40).max(1200).describe("What users hit, in their terms; no counts"),
    impact: z.string().trim().min(30).max(800).describe("Who it hurts and how badly; no counts"),
    evidence: z
      .array(
        z.object({
          noteId: z.string().describe("Note id (note_...) from get-brief-context"),
          quote: z.string().max(MAX_QUOTE_CHARS).describe("5-40 consecutive words copied exactly from the note's text"),
          why: z.string().trim().max(200).optional().describe("Optional: what this quote shows"),
        }),
      )
      .min(2)
      .max(8)
      .describe("3-6 quotes, from different reporters where possible"),
    nextStep: z.string().trim().min(15).max(600).describe("One concrete next step for the team"),
  }),
  outputSchema: z.object({
    briefId: z.string(),
    title: z.string(),
    evidenceKept: z.number(),
    markdown: z.string(),
    nextStep: z.string(),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, theme: ref, title, problem, impact, evidence, nextStep }) => {
    const board = await requireBoard(boardId, "editor");
    const active = await getActiveCodebook(boardId);
    if (!active) return errors.noWrite("This board has no themes yet.", "no_codebook");
    const theme = resolveThemeRef(active.themes, ref);
    if (!theme) return errors.noWrite(`No theme "${ref}" in the active codebook.`, "theme_not_found", { statusCode: 404 });
    if (theme.internal) {
      return errors.noWrite(`"${theme.name}" is marked internal (not product feedback), so it gets no brief.`, "internal_theme");
    }

    const db = getDb();
    const ids = [...new Set(evidence.map((e) => e.noteId))];
    const notes = await db
      .select({ id: schema.notes.id, title: schema.notes.title, body: schema.notes.body, themeId: schema.placements.themeId })
      .from(schema.notes)
      .innerJoin(schema.placements, eq(schema.placements.noteId, schema.notes.id))
      .where(and(eq(schema.notes.boardId, boardId), inArray(schema.notes.id, ids)));
    const byId = new Map(notes.map((n) => [n.id, n]));

    const problems: string[] = [];
    const kept: BriefBody["evidence"] = [];
    evidence.forEach((e, i) => {
      const note = byId.get(e.noteId);
      if (!note) return problems.push(`Quote ${i + 1}: ${e.noteId} is not a note on this board.`);
      if (note.themeId !== theme.id) return problems.push(`Quote ${i + 1}: ${e.noteId} is not in "${theme.name}".`);
      const span = findQuote(noteText(note), e.quote);
      if (!span) return problems.push(`Quote ${i + 1} (${e.noteId}) is not verbatim; copy it exactly from the note's text.`);
      if (kept.some((k) => k.noteId === e.noteId && k.start === span.start)) return problems.push(`Quote ${i + 1} repeats an earlier quote.`);
      kept.push({ noteId: e.noteId, start: span.start, end: span.end, why: e.why ?? null });
      return undefined;
    });
    if (problems.length) return errors.noWrite(`Brief not saved. ${problems.join(" ")}`, "invalid_evidence");

    const metrics = await briefMetrics(board, theme, active.themes);
    const distinctNotes = new Set(kept.map((k) => k.noteId)).size;
    if (metrics.notes >= 2 && distinctNotes < 2) {
      return errors.noWrite("Brief not saved. Quote at least two different notes so the evidence shows more than one report.", "invalid_evidence");
    }

    const body: BriefBody = { problem, impact, evidence: kept, nextStep };
    const id = newId("brf");
    const now = nowIso();
    await db.insert(schema.briefs).values({ id, boardId, themeId: theme.id, title, body, metrics, createdAt: now, ...tenantOf(board) });
    await touchBoard(boardId);
    const [row] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, id)).limit(1);
    const view = await loadBriefView(board, row!);
    return {
      briefId: id,
      title,
      evidenceKept: kept.length,
      markdown: view.markdown,
      nextStep: `Now write your reply to the user (your turn is not finished without it): the brief's title, the problem in one line, each evidence quote with its issue link, the facts from the brief (notes, distinct problems, reporters, priority), and offer export-markdown or file-github-issue (say the target repo; offer dryRun to preview).`,
      message: `Saved the brief "${title}" with ${kept.length} verified quotes from ${distinctNotes} reports. It can be exported as Markdown or filed as a GitHub issue (file-github-issue, which asks the user to approve).`,
    };
  },
});
