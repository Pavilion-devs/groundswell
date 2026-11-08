import { defineAction } from "@agent-native/core/action";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, tenantOf } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { countPendingCorrections } from "../server/lib/corrections.js";
import { newId, nowIso } from "../server/lib/ids.js";
import { REVISION_SUGGEST_AT } from "../server/lib/revisions.js";
import { resolveThemeRef, themeErrors } from "../server/lib/themes.js";

export default defineAction({
  description:
    "Move notes into a theme (or to Unsorted with to=null) as the user's decision. This is what dragging does in the UI. Moved notes are pinned: later agent sorts never move them again. Moving a note the agent had placed records a correction the agent can learn from. Agents: only call this when the user explicitly asks to move specific notes.",
  searchHints: ["drag note", "recategorize", "reassign theme", "pin note"],
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    noteIds: z.array(z.string()).min(1).max(500).describe("Notes to move"),
    to: z.string().nullable().describe("Target theme id (thm_...) or key; null moves the notes to Unsorted"),
    reason: z.string().trim().max(300).optional().describe("Optional: why, in the user's words; stored with the correction"),
  }),
  outputSchema: z.object({
    moved: z.number(),
    unchanged: z.number(),
    corrections: z.number(),
    notFound: z.array(z.string()),
    to: z.object({ id: z.string(), name: z.string() }).nullable(),
    pendingCorrections: z.number(),
    revisionSuggested: z.boolean(),
    message: z.string(),
  }),
  errors: themeErrors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  run: async ({ boardId, noteIds, to, reason }) => {
    const board = await requireBoard(boardId, "editor");
    const db = getDb();
    let target: { id: string; name: string } | null = null;
    if (to !== null) {
      const active = await getActiveCodebook(boardId);
      if (!active) return themeErrors.noWrite("This board has no themes yet.", "no_codebook");
      const theme = resolveThemeRef(active.themes, to);
      if (!theme) return themeErrors.noWrite(`No theme "${to}" in the active codebook.`, "theme_not_found", { statusCode: 404 });
      target = { id: theme.id, name: theme.name };
    }

    const ids = [...new Set(noteIds)];
    const [notes, existing] = await Promise.all([
      db.select({ id: schema.notes.id }).from(schema.notes).where(and(eq(schema.notes.boardId, boardId), inArray(schema.notes.id, ids))),
      db.select().from(schema.placements).where(inArray(schema.placements.noteId, ids)),
    ]);
    const onBoard = new Set(notes.map((n) => n.id));
    const notFound = ids.filter((id) => !onBoard.has(id));
    const prior = new Map(existing.map((e) => [e.noteId, e]));
    const now = nowIso();
    const tenant = tenantOf(board);
    const targetId = target?.id ?? null;

    const placements: Array<typeof schema.placements.$inferInsert> = [];
    const corrections: Array<typeof schema.corrections.$inferInsert> = [];
    let unchanged = 0;
    for (const noteId of ids) {
      if (!onBoard.has(noteId)) continue;
      const before = prior.get(noteId);
      const fromId = before?.themeId ?? null;
      if (before && fromId === targetId && before.pinned) {
        unchanged++;
        continue;
      }
      placements.push({
        noteId,
        boardId,
        themeId: targetId,
        suggestedThemeId: null,
        confidence: null,
        rationale: reason ?? null,
        // The old quote argued for the old theme; it no longer applies.
        quoteStart: fromId === targetId ? (before?.quoteStart ?? null) : null,
        quoteEnd: fromId === targetId ? (before?.quoteEnd ?? null) : null,
        pinned: true,
        placedBy: "user",
        lastRunId: null,
        updatedAt: now,
        ...tenant,
      });
      // The agent learns from overrides of its own work (and from sorting what it left unsorted).
      if (fromId !== targetId && (!before || before.placedBy === "agent")) {
        corrections.push({
          id: newId("cor"),
          boardId,
          noteId,
          fromThemeId: fromId ?? before?.suggestedThemeId ?? null,
          toThemeId: targetId,
          reason: reason ?? null,
          createdAt: now,
          ...tenant,
        });
      }
    }

    if (placements.length) {
      await db.transaction(async (tx) => {
        await tx
          .insert(schema.placements)
          .values(placements)
          .onConflictDoUpdate({
            target: schema.placements.noteId,
            set: {
              themeId: sql`excluded.theme_id`,
              suggestedThemeId: sql`excluded.suggested_theme_id`,
              confidence: sql`excluded.confidence`,
              rationale: sql`excluded.rationale`,
              quoteStart: sql`excluded.quote_start`,
              quoteEnd: sql`excluded.quote_end`,
              pinned: sql`excluded.pinned`,
              placedBy: sql`excluded.placed_by`,
              lastRunId: sql`excluded.last_run_id`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
        if (corrections.length) await tx.insert(schema.corrections).values(corrections);
      });
    }

    const where = target ? `"${target.name}"` : "Unsorted";
    const pendingCorrections = await countPendingCorrections(boardId);
    const revisionSuggested = corrections.length > 0 && pendingCorrections >= REVISION_SUGGEST_AT;
    return {
      moved: placements.length,
      unchanged,
      corrections: corrections.length,
      notFound,
      to: target,
      pendingCorrections,
      revisionSuggested,
      message: `Moved ${placements.length} note${placements.length === 1 ? "" : "s"} to ${where} and pinned ${placements.length === 1 ? "it" : "them"}.${corrections.length ? ` Recorded ${corrections.length} correction${corrections.length === 1 ? "" : "s"}.` : ""}${notFound.length ? ` ${notFound.length} ids were not on this board.` : ""}${revisionSuggested ? ` ${pendingCorrections} corrections are pending: offer to propose a codebook revision so the agent learns from them.` : ""}`,
    };
  },
});
