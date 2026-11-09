import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";

export default defineAction({
  description:
    "List the digests saved for a board (by the weekly digest automation or on request), newest first, with their period, title and Markdown body.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    limit: z.coerce.number().int().min(1).max(50).default(10).describe("How many, newest first; defaults to 10"),
  }),
  outputSchema: z.object({
    digests: z.array(
      z.object({ id: z.string(), title: z.string(), body: z.string(), periodStart: z.string(), periodEnd: z.string(), createdAt: z.string() }),
    ),
  }),
  http: { method: "GET" },
  mcpAnnotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, limit }) => {
    await requireBoard(boardId, "viewer");
    const rows = await getDb()
      .select({
        id: schema.digests.id,
        title: schema.digests.title,
        body: schema.digests.body,
        periodStart: schema.digests.periodStart,
        periodEnd: schema.digests.periodEnd,
        createdAt: schema.digests.createdAt,
      })
      .from(schema.digests)
      .where(eq(schema.digests.boardId, boardId))
      .orderBy(desc(schema.digests.createdAt))
      .limit(limit);
    return { digests: rows };
  },
});
