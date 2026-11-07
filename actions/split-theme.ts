import { defineAction } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { tenantOf, touchBoard } from "../server/lib/boards.js";
import { colorPicker, themeKey, uniqueKey } from "../server/lib/codebook.js";
import { newId, nowIso } from "../server/lib/ids.js";
import { requireActiveTheme, themeErrors } from "../server/lib/themes.js";

export default defineAction({
  description:
    "Split a theme into new, sharper themes. For each new theme give a name, a definition and the ids of the notes (currently in the original theme) that move into it. Notes you don't list stay in the original theme; the original is removed if it ends up empty and removeOriginalIfEmpty is true. Read the theme's notes with list-notes(themeId) first.",
  searchHints: ["break up theme", "divide cluster"],
  schema: z.object({
    themeId: z.string().describe("Theme to split (thm_...)"),
    parts: z
      .array(
        z.object({
          name: z.string().trim().min(2).max(60).describe("New theme name"),
          definition: z.string().trim().min(10).max(500).describe("What belongs in it"),
          includeRules: z.array(z.string().trim().min(3).max(200)).max(6).optional().describe("Signals that put a note here"),
          excludeRules: z.array(z.string().trim().min(3).max(200)).max(6).optional().describe("Near-misses that belong elsewhere"),
          noteIds: z.array(z.string()).min(1).max(500).describe("Notes from the original theme that move here"),
        }),
      )
      .min(1)
      .max(6)
      .describe("The new themes"),
    removeOriginalIfEmpty: z
      .preprocess((v) => (v === undefined ? undefined : v === true || v === "true"), z.boolean().default(true))
      .describe("Remove the original theme when no notes remain in it; defaults to true"),
  }),
  outputSchema: z.object({
    created: z.array(z.object({ id: z.string(), key: z.string(), name: z.string(), notes: z.number() })),
    leftInOriginal: z.number(),
    originalRemoved: z.boolean(),
    ignoredNoteIds: z.array(z.string()),
    message: z.string(),
  }),
  errors: themeErrors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ themeId, parts, removeOriginalIfEmpty }) => {
    const { theme, board, themes } = await requireActiveTheme(themeId);
    const names = parts.map((p) => p.name.toLowerCase());
    if (new Set(names).size !== names.length) return themeErrors.noWrite("Two new themes have the same name.", "bad_request");
    const clash = themes.find((t) => t.id !== themeId && names.includes(t.name.toLowerCase()));
    if (clash) return themeErrors.noWrite(`A theme called "${clash.name}" already exists.`, "bad_request");

    const db = getDb();
    const inTheme = await db
      .select({ noteId: schema.placements.noteId })
      .from(schema.placements)
      .where(eq(schema.placements.themeId, themeId));
    const members = new Set(inTheme.map((r) => r.noteId));
    const claimed = new Set<string>();
    const ignoredNoteIds: string[] = [];
    const plan = parts.map((p) => {
      const ids = [...new Set(p.noteIds)].filter((id) => {
        if (!members.has(id) || claimed.has(id)) {
          ignoredNoteIds.push(id);
          return false;
        }
        claimed.add(id);
        return true;
      });
      return { ...p, ids };
    });
    if (plan.every((p) => p.ids.length === 0)) {
      return themeErrors.noWrite("None of the listed notes are in this theme. Read them with list-notes(themeId) first.", "bad_request");
    }

    const now = nowIso();
    const tenant = tenantOf(board);
    const taken = new Set(themes.map((t) => t.key));
    const nextColor = colorPicker(themes.map((t) => t.color));
    const created: Array<{ id: string; key: string; name: string; notes: number }> = [];
    const leftInOriginal = members.size - claimed.size;
    const originalRemoved = removeOriginalIfEmpty && leftInOriginal === 0;

    await db.transaction(async (tx) => {
      for (const p of plan) {
        const key = uniqueKey(themeKey(p.name), taken);
        taken.add(key);
        const color = nextColor();
        const id = newId("thm");
        await tx.insert(schema.themes).values({
          id,
          boardId: theme.boardId,
          codebookId: theme.codebookId,
          key,
          name: p.name,
          definition: p.definition,
          includeRules: p.includeRules ?? [],
          excludeRules: p.excludeRules ?? [],
          color,
          x: theme.x,
          y: theme.y,
          createdAt: now,
          updatedAt: now,
          ...tenant,
        });
        if (p.ids.length) {
          await tx
            .update(schema.placements)
            .set({ themeId: id, updatedAt: now })
            .where(and(eq(schema.placements.themeId, themeId), inArray(schema.placements.noteId, p.ids)));
        }
        created.push({ id, key, name: p.name, notes: p.ids.length });
      }
      if (originalRemoved) await tx.delete(schema.themes).where(eq(schema.themes.id, themeId));
    });
    await touchBoard(theme.boardId);
    return {
      created,
      leftInOriginal,
      originalRemoved,
      ignoredNoteIds,
      message: `Split "${theme.name}" into ${created.map((c) => `"${c.name}" (${c.notes})`).join(", ")}.${originalRemoved ? " The original theme was empty and was removed." : ` ${leftInOriginal} notes stayed in "${theme.name}".`}${ignoredNoteIds.length ? ` Ignored ${ignoredNoteIds.length} ids that were not in the theme.` : ""}`,
    };
  },
});
