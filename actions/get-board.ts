import { defineAction } from "@agent-native/core/action";
import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";

const runShape = z.object({
  id: z.string(),
  kind: z.string(),
  status: z.string(),
  progress: z.number(),
  total: z.number().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});

export default defineAction({
  description:
    "Get one board: its title, sources, note and theme counts, how many notes are still unsorted, and its most recent runs (imports, sorting). Use this to orient before working on a board.",
  schema: z.object({ id: z.string().describe("Board id (brd_...)") }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    visibility: z.string(),
    counts: z.object({ notes: z.number(), sorted: z.number(), unsorted: z.number(), sources: z.number() }),
    sources: z.array(
      z.object({
        id: z.string(),
        kind: z.string(),
        label: z.string(),
        lastSyncedAt: z.string().nullable(),
        stats: z.record(z.string(), z.unknown()).nullable(),
      }),
    ),
    recentRuns: z.array(runShape),
  }),
  http: { method: "GET" },
  run: async ({ id }) => {
    const board = await requireBoard(id, "viewer");
    const db = getDb();
    const [[noteCount], [sortedCount], sources, recentRuns] = await Promise.all([
      db.select({ n: count() }).from(schema.notes).where(eq(schema.notes.boardId, id)),
      db
        .select({ n: count() })
        .from(schema.placements)
        .where(and(eq(schema.placements.boardId, id), isNotNull(schema.placements.themeId))),
      db
        .select({
          id: schema.sources.id,
          kind: schema.sources.kind,
          label: schema.sources.label,
          lastSyncedAt: schema.sources.lastSyncedAt,
          stats: schema.sources.stats,
        })
        .from(schema.sources)
        .where(eq(schema.sources.boardId, id))
        .orderBy(schema.sources.createdAt),
      db
        .select({
          id: schema.runs.id,
          kind: schema.runs.kind,
          status: schema.runs.status,
          progress: schema.runs.progress,
          total: schema.runs.total,
          error: schema.runs.error,
          createdAt: schema.runs.createdAt,
          finishedAt: schema.runs.finishedAt,
        })
        .from(schema.runs)
        .where(eq(schema.runs.boardId, id))
        .orderBy(desc(schema.runs.createdAt))
        .limit(5),
    ]);
    const notes = Number(noteCount?.n ?? 0);
    const sorted = Number(sortedCount?.n ?? 0);
    return {
      id: board.id,
      title: board.title,
      description: board.description,
      visibility: board.visibility,
      counts: { notes, sorted, unsorted: notes - sorted, sources: sources.length },
      sources: sources.map((s) => ({ ...s, stats: (s.stats as Record<string, unknown> | null) ?? null })),
      recentRuns,
    };
  },
});
