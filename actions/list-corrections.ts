import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireBoard } from "../server/lib/boards.js";
import { countPendingCorrections, loadCorrections } from "../server/lib/corrections.js";
import { REVISION_SUGGEST_AT } from "../server/lib/revisions.js";

const themeRef = z.object({ key: z.string(), name: z.string() }).nullable();

export default defineAction({
  description:
    "List the corrections on a board: each time the user moved a note the agent had placed (or left in Unsorted), with the note, the theme it left, the theme it went to and the user's reason. Pending corrections have not been learned from yet; read them before propose-codebook-revision, and use them to answer \"why did I move these?\".",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    pendingOnly: z
      .preprocess((v) => (v === undefined ? undefined : v === true || v === "true"), z.boolean().default(true))
      .describe("Only corrections no revision has used yet; defaults to true"),
    limit: z.coerce.number().int().min(1).max(200).default(50).describe("How many, newest first; defaults to 50"),
  }),
  outputSchema: z.object({
    corrections: z.array(
      z.object({
        id: z.string(),
        noteId: z.string(),
        noteTitle: z.string(),
        excerpt: z.string(),
        from: themeRef,
        to: themeRef,
        reason: z.string().nullable(),
        createdAt: z.string(),
        consumedByCodebookId: z.string().nullable(),
      }),
    ),
    pending: z.number(),
    revisionSuggested: z.boolean(),
    message: z.string(),
  }),
  http: { method: "GET" },
  mcpAnnotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, pendingOnly, limit }) => {
    await requireBoard(boardId, "viewer");
    const [corrections, pending] = await Promise.all([loadCorrections(boardId, { pendingOnly, limit }), countPendingCorrections(boardId)]);
    const revisionSuggested = pending >= REVISION_SUGGEST_AT;
    return {
      corrections,
      pending,
      revisionSuggested,
      message:
        pending === 0
          ? "No pending corrections."
          : `${pending} pending correction${pending === 1 ? "" : "s"}.${revisionSuggested ? " Enough to propose a codebook revision." : ""}`,
    };
  },
});
