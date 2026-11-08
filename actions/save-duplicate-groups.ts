import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, tenantOf, touchBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { validateGroups } from "../server/lib/duplicates.js";
import { newId, nowIso } from "../server/lib/ids.js";
import { resolveThemeRef } from "../server/lib/themes.js";

const errors = defineActionErrors("no_codebook", "theme_not_found", "invalid_groups");

export default defineAction({
  description:
    "Save the duplicate groups you found in one theme: sets of notes that report the same underlying problem, each with a canonical note (the clearest report) and a one-line summary of the shared problem. Replaces the theme's previous groups. Read the theme's notes first (list-notes with themeId, get-note for detail) and group only true duplicates: same problem, not just the same area. Priorities then count each group once.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    theme: z.string().describe("Theme id (thm_...) or key in the active codebook"),
    groups: z
      .array(
        z.object({
          canonicalNoteId: z.string().describe("The clearest report of the problem (note_...)"),
          memberNoteIds: z.array(z.string()).min(1).max(100).describe("All notes in the group, canonical included"),
          summary: z.string().trim().min(5).max(200).describe("The shared problem in one line"),
        }),
      )
      .max(100)
      .describe("Duplicate groups; an empty list clears the theme's groups"),
  }),
  outputSchema: z.object({
    themeId: z.string(),
    groups: z.number(),
    notesGrouped: z.number(),
    notesInTheme: z.number(),
    uniqueProblems: z.number(),
    nextStep: z.string(),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  run: async ({ boardId, theme: ref, groups }) => {
    const board = await requireBoard(boardId, "editor");
    const active = await getActiveCodebook(boardId);
    if (!active) return errors.noWrite("This board has no themes yet.", "no_codebook");
    const theme = resolveThemeRef(active.themes, ref);
    if (!theme) return errors.noWrite(`No theme "${ref}" in the active codebook.`, "theme_not_found", { statusCode: 404 });
    const db = getDb();
    const inTheme = await db
      .select({ noteId: schema.placements.noteId })
      .from(schema.placements)
      .where(and(eq(schema.placements.boardId, boardId), eq(schema.placements.themeId, theme.id)));
    const noteIds = new Set(inTheme.map((r) => r.noteId));
    const result = validateGroups(groups, noteIds);
    if (!result.ok) return errors.noWrite(`Not saved: ${result.errors.join(" ")}`, "invalid_groups");

    const now = nowIso();
    const tenant = tenantOf(board);
    await db.transaction(async (tx) => {
      // Replace groups anchored in this theme (by where their canonical note sits now).
      const existing = await tx
        .select({ id: schema.duplicateGroups.id, canonical: schema.duplicateGroups.canonicalNoteId })
        .from(schema.duplicateGroups)
        .where(eq(schema.duplicateGroups.boardId, boardId));
      const stale = existing.filter((g) => noteIds.has(g.canonical)).map((g) => g.id);
      if (stale.length) await tx.delete(schema.duplicateGroups).where(inArray(schema.duplicateGroups.id, stale));
      if (result.groups.length) {
        await tx.insert(schema.duplicateGroups).values(
          result.groups.map((g) => ({
            id: newId("dup"),
            boardId,
            themeId: theme.id,
            canonicalNoteId: g.canonicalNoteId,
            memberNoteIds: g.memberNoteIds,
            summary: g.summary,
            createdAt: now,
            ...tenant,
          })),
        );
      }
    });
    await touchBoard(boardId);

    const notesGrouped = result.groups.reduce((n, g) => n + g.memberNoteIds.length, 0);
    const uniqueProblems = noteIds.size - (notesGrouped - result.groups.length);
    return {
      themeId: theme.id,
      groups: result.groups.length,
      notesGrouped,
      notesInTheme: noteIds.size,
      uniqueProblems,
      nextStep: "Tell the user this result in one line (notes vs distinct problems) and list each group's summary with its size. If they also asked for a brief, continue with get-brief-context.",
      message: `"${theme.name}": ${noteIds.size} notes are ${uniqueProblems} distinct problems (${result.groups.length} duplicate group${result.groups.length === 1 ? "" : "s"} covering ${notesGrouped} notes).`,
    };
  },
});
