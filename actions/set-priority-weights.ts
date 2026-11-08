import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, touchBoard } from "../server/lib/boards.js";
import { nowIso } from "../server/lib/ids.js";
import { DEFAULT_WEIGHTS, parseWeights, weightsSchema } from "../server/lib/priorities.js";

const weight = (what: string) => z.coerce.number().min(0).max(5).optional().describe(`Weight for ${what}, 0-5`);

export default defineAction({
  description:
    "Tune how a board's priorities are scored: weights 0-5 for volume, distinct reporters, engagement and recency. Pass only the weights to change, or reset=true to restore the defaults. The ranking (get-priorities) updates immediately.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    volume: weight("volume (notes, duplicates collapsed)"),
    reporters: weight("distinct reporters"),
    engagement: weight("engagement (comments + 2 x reactions)"),
    recency: weight("recent notes"),
    reset: z
      .preprocess((v) => (v === undefined ? undefined : v === true || v === "true"), z.boolean().default(false))
      .describe("Restore the default weights"),
  }),
  outputSchema: z.object({
    weights: z.object({ volume: z.number(), reporters: z.number(), engagement: z.number(), recency: z.number() }),
    message: z.string(),
  }),
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  run: async ({ boardId, reset, ...patch }) => {
    const board = await requireBoard(boardId, "editor");
    const current = parseWeights(board.priorityWeights);
    const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const weights = weightsSchema.parse(reset ? DEFAULT_WEIGHTS : { ...current, ...changes });
    await getDb().update(schema.boards).set({ priorityWeights: weights, updatedAt: nowIso() }).where(eq(schema.boards.id, boardId));
    await touchBoard(boardId);
    return {
      weights,
      message: reset
        ? "Priority weights reset to the defaults."
        : `Priority weights: volume ${weights.volume}, reporters ${weights.reporters}, engagement ${weights.engagement}, recency ${weights.recency}.`,
    };
  },
});
