import { defineAction } from "@agent-native/core/action";
import { notify } from "@agent-native/core/notifications";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, tenantOf, touchBoard } from "../server/lib/boards.js";
import { digestStats } from "../server/lib/digest.js";
import { newId, nowIso } from "../server/lib/ids.js";

export default defineAction({
  description:
    "Save a board digest the agent wrote from get-digest-data and post it to the user's Inbox. The server recounts the period's facts and stores them with the text, so the numbers on record always come from SQL. Used by the weekly digest automation; also fine on request.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    days: z.coerce.number().int().min(1).max(90).default(7).describe("The period the digest covers, as passed to get-digest-data"),
    title: z.string().trim().min(5).max(120).describe('e.g. "Week of Nov 2: docs 404s keep climbing"'),
    body: z.string().trim().min(40).max(4000).describe("The digest in Markdown, using only numbers from get-digest-data"),
  }),
  outputSchema: z.object({ digestId: z.string(), notified: z.boolean(), message: z.string() }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, days, title, body }) => {
    const board = await requireBoard(boardId, "editor");
    const stats = await digestStats(board, days);
    const id = newId("dgs");
    await getDb()
      .insert(schema.digests)
      .values({ id, boardId, periodStart: stats.periodStart, periodEnd: stats.periodEnd, stats, title, body, createdAt: nowIso(), ...tenantOf(board) });
    await touchBoard(boardId);
    const owner = getRequestUserEmail();
    const sent = owner
      ? await notify(
          {
            severity: "info",
            title: `${board.title}: ${title}`,
            body,
            metadata: { boardId, digestId: id, link: `/boards/${boardId}` },
            // A retried automation run must not post the same digest twice.
            idempotencyKey: `digest:${boardId}:${stats.periodEnd.slice(0, 10)}:${days}`,
          },
          { owner },
        )
      : undefined;
    return { digestId: id, notified: !!sent, message: `Saved the digest "${title}"${sent ? " and posted it to the Inbox" : ""}.` };
  },
});
