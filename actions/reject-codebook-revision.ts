import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, touchBoard } from "../server/lib/boards.js";
import { parseDiff } from "../server/lib/revisions.js";

const errors = defineActionErrors("proposal_not_found", "not_a_proposal");

export default defineAction({
  description:
    "Reject a proposed codebook revision. Nothing on the board changes and the corrections stay pending, so a better revision can be proposed later. Record the user's reason when they give one.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    codebookId: z.string().describe("The proposed codebook id (cb_...)"),
    reason: z.string().trim().max(300).optional().describe("Why the user declined, in their words"),
  }),
  outputSchema: z.object({ codebookId: z.string(), message: z.string() }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  run: async ({ boardId, codebookId, reason }) => {
    await requireBoard(boardId, "editor");
    const db = getDb();
    const [proposal] = await db.select().from(schema.codebooks).where(eq(schema.codebooks.id, codebookId)).limit(1);
    if (!proposal || proposal.boardId !== boardId) return errors.noWrite(`No proposal ${codebookId} on this board.`, "proposal_not_found", { statusCode: 404 });
    if (proposal.status === "rejected") return { codebookId, message: "This proposal was already rejected." };
    if (proposal.status !== "proposed") return errors.noWrite(`Codebook ${codebookId} is ${proposal.status}, not an open proposal.`, "not_a_proposal");
    const diff = parseDiff(proposal.diff);
    await db
      .update(schema.codebooks)
      .set({ status: "rejected", ...(diff && reason ? { diff: { ...diff, rejectReason: reason } } : {}) })
      .where(eq(schema.codebooks.id, codebookId));
    await touchBoard(boardId);
    return { codebookId, message: "Rejected the proposal. The board is unchanged and the corrections are still pending." };
  },
});
