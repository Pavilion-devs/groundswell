import { defineAction } from "@agent-native/core/action";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";

export default defineAction({
  description:
    "Get a board's active codebook: every theme with its key, definition, include/exclude rules and note count, plus how many notes are unsorted or not yet looked at. Returns codebook: null when the board has no themes yet.",
  schema: z.object({ boardId: z.string().describe("Board id (brd_...)") }),
  outputSchema: z.object({
    codebook: z
      .object({
        id: z.string(),
        version: z.number(),
        summary: z.string().nullable(),
        createdBy: z.string(),
        createdAt: z.string(),
      })
      .nullable(),
    themes: z.array(
      z.object({
        id: z.string(),
        key: z.string(),
        name: z.string(),
        definition: z.string(),
        includeRules: z.array(z.string()),
        excludeRules: z.array(z.string()),
        color: z.string().nullable(),
        internal: z.boolean(),
        noteCount: z.number(),
        pinnedCount: z.number(),
      }),
    ),
    counts: z.object({ notes: z.number(), sorted: z.number(), unsortedLowConfidence: z.number(), notYetSorted: z.number() }),
  }),
  http: { method: "GET" },
  run: async ({ boardId }) => {
    await requireBoard(boardId, "viewer");
    const db = getDb();
    const active = await getActiveCodebook(boardId);
    const p = schema.placements;
    const [perTheme, [noteRow], [unsortedRow], [placedRow]] = await Promise.all([
      db
        .select({ themeId: p.themeId, pinned: p.pinned, n: count() })
        .from(p)
        .where(and(eq(p.boardId, boardId), isNotNull(p.themeId)))
        .groupBy(p.themeId, p.pinned),
      db.select({ n: count() }).from(schema.notes).where(eq(schema.notes.boardId, boardId)),
      db.select({ n: count() }).from(p).where(and(eq(p.boardId, boardId), isNull(p.themeId))),
      db.select({ n: count() }).from(p).where(eq(p.boardId, boardId)),
    ]);
    const totals = new Map<string, { all: number; pinned: number }>();
    for (const r of perTheme) {
      if (!r.themeId) continue;
      const t = totals.get(r.themeId) ?? { all: 0, pinned: 0 };
      t.all += Number(r.n);
      if (r.pinned) t.pinned += Number(r.n);
      totals.set(r.themeId, t);
    }
    const notes = Number(noteRow?.n ?? 0);
    const placed = Number(placedRow?.n ?? 0);
    const unsortedLowConfidence = Number(unsortedRow?.n ?? 0);
    return {
      codebook: active
        ? {
            id: active.codebook.id,
            version: active.codebook.version,
            summary: active.codebook.summary,
            createdBy: active.codebook.createdBy,
            createdAt: active.codebook.createdAt,
          }
        : null,
      themes: (active?.themes ?? []).map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        definition: t.definition,
        includeRules: Array.isArray(t.includeRules) ? (t.includeRules as string[]) : [],
        excludeRules: Array.isArray(t.excludeRules) ? (t.excludeRules as string[]) : [],
        internal: t.internal,
        color: t.color,
        noteCount: totals.get(t.id)?.all ?? 0,
        pinnedCount: totals.get(t.id)?.pinned ?? 0,
      })),
      counts: { notes, sorted: placed - unsortedLowConfidence, unsortedLowConfidence, notYetSorted: notes - placed },
    };
  },
});
