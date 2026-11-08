import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, tenantOf, touchBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { nowIso } from "../server/lib/ids.js";
import { parseSnapshot, planRestore } from "../server/lib/revisions.js";
import { cancelRun } from "../server/lib/runs.js";

const errors = defineActionErrors("no_codebook", "not_a_revision", "edited_since");

export default defineAction({
  description:
    "Undo the last applied codebook revision: the previous codebook version becomes active again and every note goes back exactly where it was before the revision, except notes the user moved since (their edits win). A re-sort still running for the revision is stopped. The corrections it learned become pending again.",
  schema: z.object({ boardId: z.string().describe("Board id (brd_...)") }),
  outputSchema: z.object({
    restoredCodebookId: z.string(),
    restoredVersion: z.number(),
    undoneCodebookId: z.string(),
    notesRestored: z.number(),
    keptUserEdits: z.number(),
    runsStopped: z.number(),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId }) => {
    const board = await requireBoard(boardId, "editor");
    const db = getDb();
    const active = await getActiveCodebook(boardId);
    if (!active) return errors.noWrite("This board has no codebook.", "no_codebook");
    const { codebook } = active;
    const snapshot = parseSnapshot(codebook.restoreSnapshot);
    if (!snapshot || !codebook.parentId || !codebook.appliedAt) {
      return errors.noWrite("The active codebook was not made by applying a revision, so there is nothing to undo.", "not_a_revision");
    }
    const appliedAt = codebook.appliedAt;
    const edited = active.themes.filter((t) => t.updatedAt > appliedAt);
    if (edited.length) {
      return errors.noWrite(
        `Themes were edited after this revision was applied (${edited.map((t) => t.name).join(", ")}), so an exact undo would lose those edits. Make the change by hand instead.`,
        "edited_since",
      );
    }
    const [parent] = await db.select().from(schema.codebooks).where(eq(schema.codebooks.id, codebook.parentId)).limit(1);
    if (!parent) return errors.noWrite("The previous codebook version no longer exists.", "not_a_revision");
    const parentThemes = await db.select().from(schema.themes).where(eq(schema.themes.codebookId, parent.id));
    const parentIdByKey = new Map(parentThemes.map((t) => [t.key, t.id]));
    const undoneKeyById = new Map(active.themes.map((t) => [t.id, t.key]));

    // Stop the revision's re-sort so its sorters cannot write after the undo.
    const running = await db
      .select({ id: schema.runs.id })
      .from(schema.runs)
      .where(
        and(
          eq(schema.runs.boardId, boardId),
          eq(schema.runs.status, "running"),
          sql`${schema.runs.meta}->>'codebookId' = ${codebook.id}`,
        ),
      );
    let runsStopped = 0;
    for (const r of running) if (await cancelRun(r.id, "Stopped: its codebook revision was undone.")) runsStopped++;

    const current = await db
      .select({
        noteId: schema.placements.noteId,
        placedBy: schema.placements.placedBy,
        pinned: schema.placements.pinned,
        updatedAt: schema.placements.updatedAt,
        themeId: schema.placements.themeId,
      })
      .from(schema.placements)
      .where(eq(schema.placements.boardId, boardId));
    const plan = planRestore(snapshot, current, appliedAt);
    const now = nowIso();
    const tenant = tenantOf(board);
    const rows = plan.restore.map((s) => ({
      noteId: s.noteId,
      boardId,
      themeId: s.themeKey ? (parentIdByKey.get(s.themeKey) ?? null) : null,
      suggestedThemeId: s.suggestedKey ? (parentIdByKey.get(s.suggestedKey) ?? null) : null,
      confidence: s.confidence,
      rationale: s.rationale,
      quoteStart: s.quoteStart,
      quoteEnd: s.quoteEnd,
      pinned: s.pinned,
      placedBy: s.placedBy,
      lastRunId: s.lastRunId,
      updatedAt: s.updatedAt,
      ...tenant,
    }));
    // User edits made after the revision stay, mapped onto the restored themes by key.
    const keptOnUndone = current.filter((c) => plan.keptUserEdits.includes(c.noteId) && c.themeId && undoneKeyById.has(c.themeId));

    await db.transaction(async (tx) => {
      await tx.update(schema.codebooks).set({ status: "undone" }).where(eq(schema.codebooks.id, codebook.id));
      await tx.update(schema.codebooks).set({ status: "active" }).where(eq(schema.codebooks.id, parent.id));
      for (let i = 0; i < rows.length; i += 200) {
        await tx
          .insert(schema.placements)
          .values(rows.slice(i, i + 200))
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
      }
      if (plan.remove.length) {
        await tx.delete(schema.placements).where(and(eq(schema.placements.boardId, boardId), inArray(schema.placements.noteId, plan.remove)));
      }
      for (const k of keptOnUndone) {
        const key = undoneKeyById.get(k.themeId ?? "");
        const target = key ? (parentIdByKey.get(key) ?? null) : null;
        await tx
          .update(schema.placements)
          .set(target ? { themeId: target } : { themeId: null, pinned: false })
          .where(eq(schema.placements.noteId, k.noteId));
      }
      await tx
        .update(schema.corrections)
        .set({ consumedByCodebookId: null })
        .where(eq(schema.corrections.consumedByCodebookId, codebook.id));
      // Corrections recorded after the revision pointed at its themes; keep them pointing at live themes.
      for (const [undoneId, key] of undoneKeyById) {
        const target = parentIdByKey.get(key) ?? null;
        await tx.update(schema.corrections).set({ fromThemeId: target }).where(and(eq(schema.corrections.fromThemeId, undoneId), gt(schema.corrections.createdAt, appliedAt)));
        await tx.update(schema.corrections).set({ toThemeId: target }).where(and(eq(schema.corrections.toThemeId, undoneId), gt(schema.corrections.createdAt, appliedAt)));
      }
    });
    await touchBoard(boardId);

    return {
      restoredCodebookId: parent.id,
      restoredVersion: parent.version,
      undoneCodebookId: codebook.id,
      notesRestored: rows.length,
      keptUserEdits: plan.keptUserEdits.length,
      runsStopped,
      message: `Undid codebook v${codebook.version}; v${parent.version} is active again and ${rows.length} notes are back where they were.${plan.keptUserEdits.length ? ` ${plan.keptUserEdits.length} notes you moved since kept their place.` : ""}${runsStopped ? " Stopped the re-sort that was still running." : ""}`,
    };
  },
});
