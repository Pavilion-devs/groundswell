import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";

const errors = defineActionErrors("run_not_found");

export default defineAction({
  description:
    "Check a run (an import, sort, re-sort or brief job): its status (queued, running, succeeded, failed, cancelled), progress out of total, error, and result details.",
  schema: z.object({ id: z.string().describe("Run id (run_...)") }),
  outputSchema: z.object({
    id: z.string(),
    boardId: z.string(),
    kind: z.string(),
    status: z.string(),
    progress: z.number(),
    total: z.number().nullable(),
    error: z.string().nullable(),
    meta: z.record(z.string(), z.unknown()).nullable(),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
  }),
  http: { method: "GET" },
  errors,
  run: async ({ id }) => {
    const [run] = await getDb().select().from(schema.runs).where(eq(schema.runs.id, id)).limit(1);
    if (!run) return errors.noWrite(`Run ${id} was not found.`, "run_not_found", { statusCode: 404 });
    await requireBoard(run.boardId, "viewer");
    return {
      id: run.id,
      boardId: run.boardId,
      kind: run.kind,
      status: run.status,
      progress: run.progress,
      total: run.total,
      error: run.error,
      meta: (run.meta as Record<string, unknown> | null) ?? null,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    };
  },
});
