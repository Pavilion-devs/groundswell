import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireBoard } from "../server/lib/boards.js";
import { digestStats } from "../server/lib/digest.js";

const digestStatsSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  newFeedback: z.number(),
  arrivedOnBoard: z.number(),
  byTheme: z.array(z.object({ name: z.string(), newFeedback: z.number(), internal: z.boolean() })),
  newUnsorted: z.number(),
  revisionsApplied: z.array(z.object({ version: z.number(), summary: z.string().nullable(), appliedAt: z.string() })),
  correctionsMade: z.number(),
  briefsWritten: z.array(z.object({ title: z.string(), filedIssueUrl: z.string().nullable() })),
  topPriorities: z.array(z.object({ rank: z.number(), name: z.string(), score: z.number(), notes: z.number(), reporters: z.number() })),
  unsortedNow: z.number(),
});

export default defineAction({
  description:
    "The facts for a board digest over the last N days (default 7), all counted in SQL: new feedback per theme, notes that arrived on the board, new Unsorted notes, codebook revisions applied, corrections made, briefs written or filed, the current top priorities and today's Unsorted count. Write the digest from these numbers only, then save it with save-digest.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    days: z.coerce.number().int().min(1).max(90).default(7).describe("Length of the period in days; defaults to 7"),
  }),
  outputSchema: z.object({ stats: digestStatsSchema, nextStep: z.string() }),
  http: { method: "GET" },
  mcpAnnotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, days }) => {
    const board = await requireBoard(boardId, "viewer");
    const stats = await digestStats(board, days);
    return {
      stats,
      nextStep:
        "Write a short digest (title plus 4-8 lines of Markdown): what moved, the themes that grew, what the team learned (revisions), what shipped (briefs and issues), and the top priorities. Use only these numbers. Then call save-digest with the same days.",
    };
  },
});
