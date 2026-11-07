import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, tenantOf } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { nowIso } from "../server/lib/ids.js";
import { findQuote, MAX_QUOTE_CHARS, noteText } from "../server/lib/quotes.js";
import { CONFIDENCE_FLOOR, countNotYetSorted } from "../server/lib/sorting.js";

const errors = defineActionErrors("no_codebook", "run_mismatch");

const placementSchema = z.object({
  noteId: z.string().describe("Note id (note_...)"),
  themeKey: z
    .string()
    .nullable()
    .describe("Key of the theme the note belongs to, from the codebook; null when no theme fits"),
  confidence: z.coerce.number().min(0).max(1).describe("0-1. Below 0.5 the note stays in Unsorted and themeKey is kept only as a suggestion"),
  rationale: z.string().trim().min(3).max(240).describe("One short sentence on why it belongs there"),
  quote: z
    .string()
    .max(MAX_QUOTE_CHARS)
    .optional()
    .describe("Required whenever themeKey is set: the most telling 5-30 words copied exactly from the note text. The server keeps it only if it appears verbatim; misses come back in quoteMisses"),
});

export default defineAction({
  description:
    "Place a batch of notes into themes of the board's active codebook in one atomic write (sorters call this after get-notes-for-sorting). Notes the user placed by hand are never changed. Low-confidence notes go to Unsorted with the theme kept as a suggestion. Every themed note needs a verbatim quote: notes whose quote is missing or not verbatim are still placed but come back in quoteMisses, so resend just those with an exact quote.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    runId: z.string().optional().describe("The sort run id from start-sort-run, so progress is tracked"),
    placements: z.array(placementSchema).min(1).max(50).describe("One entry per note, up to 50"),
  }),
  outputSchema: z.object({
    placed: z.number(),
    unsorted: z.number(),
    skippedPinned: z.number(),
    quotesKept: z.number(),
    quotesRejected: z.number(),
    quoteMisses: z.array(z.object({ noteId: z.string(), reason: z.enum(["missing", "not_verbatim"]) })),
    rejected: z.array(z.object({ noteId: z.string(), reason: z.string() })),
    remainingOnBoard: z.number(),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  retrySafe: true,
  run: async ({ boardId, runId, placements }) => {
    const board = await requireBoard(boardId, "editor");
    const active = await getActiveCodebook(boardId);
    if (!active) return errors.noWrite("This board has no active codebook.", "no_codebook");
    const db = getDb();
    if (runId) {
      const [run] = await db.select({ boardId: schema.runs.boardId, status: schema.runs.status }).from(schema.runs).where(eq(schema.runs.id, runId)).limit(1);
      if (!run || run.boardId !== boardId) return errors.noWrite(`Run ${runId} does not belong to this board.`, "run_mismatch");
    }

    const themeByKey = new Map(active.themes.map((t) => [t.key, t.id]));
    const ids = [...new Set(placements.map((p) => p.noteId))];
    const [notes, existing] = await Promise.all([
      db
        .select({ id: schema.notes.id, title: schema.notes.title, body: schema.notes.body })
        .from(schema.notes)
        .where(and(eq(schema.notes.boardId, boardId), inArray(schema.notes.id, ids))),
      db
        .select({ noteId: schema.placements.noteId, pinned: schema.placements.pinned, lastRunId: schema.placements.lastRunId })
        .from(schema.placements)
        .where(inArray(schema.placements.noteId, ids)),
    ]);
    const noteById = new Map(notes.map((n) => [n.id, n]));
    const pinned = new Set(existing.filter((e) => e.pinned).map((e) => e.noteId));

    const rejected: Array<{ noteId: string; reason: string }> = [];
    let skippedPinned = 0;
    let quotesKept = 0;
    let quotesRejected = 0;
    const quoteMisses: Array<{ noteId: string; reason: "missing" | "not_verbatim" }> = [];
    let unsorted = 0;
    const now = nowIso();
    const rows: Array<typeof schema.placements.$inferInsert> = [];
    const seen = new Set<string>();

    for (const p of placements) {
      if (seen.has(p.noteId)) continue;
      seen.add(p.noteId);
      const note = noteById.get(p.noteId);
      if (!note) {
        rejected.push({ noteId: p.noteId, reason: "not a note on this board" });
        continue;
      }
      if (pinned.has(p.noteId)) {
        skippedPinned++;
        continue;
      }
      const themeId = p.themeKey === null ? null : themeByKey.get(p.themeKey);
      if (p.themeKey !== null && !themeId) {
        rejected.push({ noteId: p.noteId, reason: `unknown theme key "${p.themeKey}"` });
        continue;
      }
      const span = p.quote ? findQuote(noteText(note), p.quote) : null;
      if (p.quote) {
        if (span) quotesKept++;
        else quotesRejected++;
      }
      if (themeId && !span) quoteMisses.push({ noteId: p.noteId, reason: p.quote ? "not_verbatim" : "missing" });
      const confident = themeId !== null && themeId !== undefined && p.confidence >= CONFIDENCE_FLOOR;
      if (!confident) unsorted++;
      rows.push({
        noteId: p.noteId,
        boardId,
        themeId: confident ? themeId : null,
        suggestedThemeId: confident ? null : (themeId ?? null),
        confidence: p.confidence,
        rationale: p.rationale,
        quoteStart: span?.start ?? null,
        quoteEnd: span?.end ?? null,
        pinned: false,
        placedBy: "agent",
        lastRunId: runId ?? null,
        updatedAt: now,
        ...tenantOf(board),
      });
    }

    if (rows.length) {
      await db.transaction(async (tx) => {
        await tx
          .insert(schema.placements)
          .values(rows)
          .onConflictDoUpdate({
            target: schema.placements.noteId,
            set: {
              themeId: sql`excluded.theme_id`,
              suggestedThemeId: sql`excluded.suggested_theme_id`,
              confidence: sql`excluded.confidence`,
              rationale: sql`excluded.rationale`,
              quoteStart: sql`excluded.quote_start`,
              quoteEnd: sql`excluded.quote_end`,
              placedBy: sql`excluded.placed_by`,
              lastRunId: sql`excluded.last_run_id`,
              updatedAt: sql`excluded.updated_at`,
            },
            // A note pinned between our read and this write stays as the user left it.
            setWhere: sql`${schema.placements.pinned} = false`,
          });
        if (runId) {
          // Progress counts distinct notes; quote stats accumulate on the run for proof-of-done.
          const fresh = rows.filter((r) => !existing.some((e) => e.noteId === r.noteId && e.lastRunId === runId)).length;
          await tx
            .update(schema.runs)
            .set({
              progress: sql`${schema.runs.progress} + ${fresh}`,
              meta: sql`coalesce(${schema.runs.meta}, '{}'::jsonb) || jsonb_build_object(
                'quotesKept', coalesce((${schema.runs.meta}->>'quotesKept')::int, 0) + ${quotesKept},
                'quotesRejected', coalesce((${schema.runs.meta}->>'quotesRejected')::int, 0) + ${quotesRejected},
                'quotesMissing', coalesce((${schema.runs.meta}->>'quotesMissing')::int, 0) + ${quoteMisses.filter((m) => m.reason === "missing").length})`,
            })
            .where(and(eq(schema.runs.id, runId), eq(schema.runs.status, "running")));
        }
      });
    }

    const remainingOnBoard = await countNotYetSorted(boardId);
    const placed = rows.length - unsorted;
    const parts = [`Placed ${placed}`, `${unsorted} to Unsorted`];
    if (skippedPinned) parts.push(`${skippedPinned} pinned by the user, left alone`);
    if (rejected.length) parts.push(`${rejected.length} rejected`);
    if (quoteMisses.length) parts.push(`${quoteMisses.length} themed notes need an exact quote (see quoteMisses; resend just those)`);
    return {
      placed,
      unsorted,
      skippedPinned,
      quotesKept,
      quotesRejected,
      quoteMisses,
      rejected,
      remainingOnBoard,
      message: `${parts.join(", ")}. ${remainingOnBoard} notes on the board are not sorted yet.`,
    };
  },
});
