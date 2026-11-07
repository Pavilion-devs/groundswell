import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, tenantOf, touchBoard } from "../server/lib/boards.js";
import { colorPicker, getActiveCodebook, nextCodebookVersion, themeKey, uniqueKey } from "../server/lib/codebook.js";
import { newId, nowIso } from "../server/lib/ids.js";

const errors = defineActionErrors("duplicate_theme_names");

const themeSchema = z.object({
  name: z.string().trim().min(2).max(60).describe('Short, specific theme name, e.g. "Self-hosted sign-in failures"'),
  definition: z
    .string()
    .trim()
    .min(10)
    .max(500)
    .describe("One or two sentences: what a note must be about to belong here, written so a careful reader could sort unseen notes with it"),
  includeRules: z.array(z.string().trim().min(3).max(200)).max(6).optional().describe("Concrete signals that put a note in this theme"),
  excludeRules: z
    .array(z.string().trim().min(3).max(200))
    .max(6)
    .optional()
    .describe('Near-misses that belong elsewhere, ideally naming the other theme ("Billing errors go to Payments")'),
});

export default defineAction({
  description:
    "Save a new version of a board's codebook (its set of themes) and make it active. Use after reading sample-notes. Themes whose name keeps the same key as in the previous version keep their notes; notes in themes that no longer exist return to Unsorted. Next step: start-sort-run.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    summary: z.string().trim().min(5).max(600).describe("What this codebook captures and why it is cut this way (shown to the user)"),
    themes: z.array(themeSchema).min(2).max(20).describe("The themes, 6-14 is usually right"),
  }),
  outputSchema: z.object({
    codebookId: z.string(),
    version: z.number(),
    themes: z.array(z.object({ id: z.string(), key: z.string(), name: z.string() })),
    keptPlacements: z.number(),
    returnedToUnsorted: z.number(),
    nextRequiredAction: z.string(),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, summary, themes }, ctx) => {
    const names = themes.map((t) => t.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      return errors.noWrite("Two themes have the same name. Give every theme a distinct name.", "duplicate_theme_names");
    }
    const board = await requireBoard(boardId, "editor");
    const tenant = tenantOf(board);
    const previous = await getActiveCodebook(boardId);
    const version = await nextCodebookVersion(boardId);
    const prevByKey = new Map((previous?.themes ?? []).map((t) => [t.key, t]));

    const codebookId = newId("cb");
    const now = nowIso();
    const taken = new Set<string>();
    // Themes that carry over keep their colour; new ones take the least-used slot.
    const keptColors = themes.map((t) => prevByKey.get(themeKey(t.name))?.color ?? null);
    const nextColor = colorPicker(keptColors);
    const rows = themes.map((t) => {
      const key = uniqueKey(themeKey(t.name), taken);
      taken.add(key);
      const prior = prevByKey.get(key);
      const color = prior?.color ?? nextColor();
      return {
        id: newId("thm"),
        boardId,
        codebookId,
        key,
        name: t.name,
        definition: t.definition,
        includeRules: t.includeRules ?? [],
        excludeRules: t.excludeRules ?? [],
        color,
        x: prior?.x ?? null,
        y: prior?.y ?? null,
        createdAt: now,
        updatedAt: now,
        ...tenant,
      };
    });

    let keptPlacements = 0;
    let returnedToUnsorted = 0;
    await getDb().transaction(async (tx) => {
      if (previous) {
        await tx.update(schema.codebooks).set({ status: "archived" }).where(eq(schema.codebooks.id, previous.codebook.id));
      }
      await tx.insert(schema.codebooks).values({
        id: codebookId,
        boardId,
        version,
        status: "active",
        createdBy: ctx?.caller === "frontend" ? "user" : "agent",
        summary,
        parentId: previous?.codebook.id ?? null,
        createdAt: now,
        ...tenant,
      });
      await tx.insert(schema.themes).values(rows);

      // Carry placements across versions by theme key.
      for (const old of previous?.themes ?? []) {
        const successor = rows.find((r) => r.key === old.key);
        if (successor) {
          const moved = await tx
            .update(schema.placements)
            .set({ themeId: successor.id, updatedAt: now })
            .where(and(eq(schema.placements.boardId, boardId), eq(schema.placements.themeId, old.id)))
            .returning({ id: schema.placements.noteId });
          keptPlacements += moved.length;
          await tx
            .update(schema.placements)
            .set({ suggestedThemeId: successor.id })
            .where(and(eq(schema.placements.boardId, boardId), eq(schema.placements.suggestedThemeId, old.id)));
        }
      }
      const goneIds = (previous?.themes ?? []).filter((t) => !rows.some((r) => r.key === t.key)).map((t) => t.id);
      if (goneIds.length) {
        const orphaned = await tx
          .update(schema.placements)
          .set({ themeId: null, pinned: false, confidence: null, updatedAt: now })
          .where(and(eq(schema.placements.boardId, boardId), inArray(schema.placements.themeId, goneIds)))
          .returning({ id: schema.placements.noteId });
        returnedToUnsorted = orphaned.length;
        await tx
          .update(schema.placements)
          .set({ suggestedThemeId: null })
          .where(and(eq(schema.placements.boardId, boardId), inArray(schema.placements.suggestedThemeId, goneIds)));
      }
    });
    await touchBoard(boardId);

    return {
      codebookId,
      version,
      themes: rows.map((r) => ({ id: r.id, key: r.key, name: r.name })),
      keptPlacements,
      returnedToUnsorted,
      nextRequiredAction: "start-sort-run",
      message: `Saved codebook v${version} with ${rows.length} themes.${keptPlacements ? ` ${keptPlacements} notes kept their theme.` : ""}${returnedToUnsorted ? ` ${returnedToUnsorted} returned to Unsorted.` : ""}`,
    };
  },
});
