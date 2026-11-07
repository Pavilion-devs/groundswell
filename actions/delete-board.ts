import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";

export default defineAction({
  description:
    "Permanently delete a board and everything on it (sources, notes, themes, placements, briefs). Owner only. This cannot be undone; confirm with the user first.",
  schema: z.object({ id: z.string().describe("Board id (brd_...)") }),
  outputSchema: z.object({ id: z.string(), title: z.string(), message: z.string() }),
  needsApproval: true,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  run: async ({ id }) => {
    const board = await requireBoard(id, "owner");
    const db = getDb();
    // Children cascade from boards; shares are keyed by resource id, not a FK.
    await db.delete(schema.boardShares).where(eq(schema.boardShares.resourceId, id));
    await db.delete(schema.boards).where(eq(schema.boards.id, id));
    return { id, title: board.title, message: `Deleted board "${board.title}".` };
  },
});
