import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";
import { poolOf, sorterBrief, sortNextStep, sortPlan } from "../server/lib/sorting.js";

const errors = defineActionErrors("run_not_found");

export default defineAction({
  description:
    "Check a run (an import, sort, re-sort or brief job): its status (queued, running, succeeded, failed, cancelled), progress out of total, error, and result details. For a sort or re-sort that is still running it also returns the sorterBrief and nextStep, so you can pick up a run someone else started (for example one the user approved in the UI).",
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
    sorterBrief: z.string().nullable(),
    nextStep: z.string().nullable(),
  }),
  http: { method: "GET" },
  errors,
  run: async ({ id }) => {
    const [run] = await getDb().select().from(schema.runs).where(eq(schema.runs.id, id)).limit(1);
    if (!run) return errors.noWrite(`Run ${id} was not found.`, "run_not_found", { statusCode: 404 });
    await requireBoard(run.boardId, "viewer");
    const meta = (run.meta as Record<string, unknown> | null) ?? null;
    const sortable = run.status === "running" && (run.kind === "classify" || run.kind === "resort");
    const total = run.total ?? 0;
    const of = typeof meta?.slices === "number" ? meta.slices : sortPlan(total, 4).of;
    const version = typeof meta?.version === "number" ? meta.version : 0;
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
      sorterBrief: sortable ? sorterBrief(run.boardId, run.id, version, poolOf(meta).scope) : null,
      nextStep: sortable
        ? `${run.progress > 0 ? "Sorters may already be working on this run: check agent-teams list/status first and only spawn sorters for slices nobody is running. " : ""}${sortNextStep(run.id, total, of, of === 1 ? "solo" : "team")}`
        : null,
    };
  },
});
