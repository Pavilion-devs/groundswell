import { defineAction } from "@agent-native/core/action";
import { accessFilter } from "@agent-native/core/sharing";
import { count, desc, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description: "List the feedback boards the current user can open, newest activity first, with how many notes each holds.",
  schema: z.object({}),
  outputSchema: z.object({
    boards: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        noteCount: z.number(),
        updatedAt: z.string(),
      }),
    ),
  }),
  http: { method: "GET" },
  run: async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: schema.boards.id,
        title: schema.boards.title,
        description: schema.boards.description,
        updatedAt: schema.boards.updatedAt,
      })
      .from(schema.boards)
      .where(accessFilter(schema.boards, schema.boardShares))
      .orderBy(desc(schema.boards.updatedAt))
      .limit(200);
    const counts = rows.length
      ? await db
          .select({ boardId: schema.notes.boardId, n: count() })
          .from(schema.notes)
          .where(inArray(schema.notes.boardId, rows.map((r) => r.id)))
          .groupBy(schema.notes.boardId)
      : [];
    const byBoard = new Map(counts.map((c) => [c.boardId, Number(c.n)]));
    return { boards: rows.map((r) => ({ ...r, noteCount: byBoard.get(r.id) ?? 0 })) };
  },
});
