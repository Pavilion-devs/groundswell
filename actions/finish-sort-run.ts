import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, touchBoard } from "../server/lib/boards.js";
import { succeedRun } from "../server/lib/runs.js";
import { countPool, scopeOf } from "../server/lib/sorting.js";

const errors = defineActionErrors("run_not_found", "not_a_sort_run");

export default defineAction({
  description:
    "Close a sort run after its sorters finish and get proof of what was saved: notes placed in a theme, notes left in Unsorted, verified quotes, notes the run never reached, and the board-wide Unsorted share. Report these numbers to the user. If unsortedShare is above 0.2, follow the coverage step of the feedback-synthesis skill.",
  schema: z.object({ runId: z.string().describe("Sort run id (run_...)") }),
  outputSchema: z.object({
    runId: z.string(),
    scope: z.enum(["new", "unsorted"]),
    complete: z.boolean(),
    placedInThemes: z.number(),
    leftUnsorted: z.number(),
    withQuote: z.number(),
    quotesRejected: z.number(),
    notReached: z.number(),
    board: z.object({ notes: z.number(), inThemes: z.number(), unsorted: z.number(), unsortedShare: z.number() }),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  run: async ({ runId }) => {
    const db = getDb();
    const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId)).limit(1);
    if (!run) return errors.noWrite(`Run ${runId} was not found.`, "run_not_found", { statusCode: 404 });
    if (run.kind !== "classify") return errors.noWrite(`Run ${runId} is a ${run.kind} run, not a sort run.`, "not_a_sort_run");
    await requireBoard(run.boardId, "editor");
    const scope = scopeOf(run.meta);
    const meta = (run.meta as Record<string, unknown> | null) ?? {};

    const p = schema.placements;
    const inRun = eq(p.lastRunId, runId);
    const onBoard = eq(p.boardId, run.boardId);
    const [[themed], [unsorted], [quoted], [boardNotes], [boardThemed]] = await Promise.all([
      db.select({ n: count() }).from(p).where(and(inRun, isNotNull(p.themeId))),
      db.select({ n: count() }).from(p).where(and(inRun, isNull(p.themeId))),
      db.select({ n: count() }).from(p).where(and(inRun, isNotNull(p.themeId), isNotNull(p.quoteStart))),
      db.select({ n: count() }).from(schema.notes).where(eq(schema.notes.boardId, run.boardId)),
      db.select({ n: count() }).from(p).where(and(onBoard, isNotNull(p.themeId))),
    ]);
    const notReached = await countPool(run.boardId, scope, runId);
    const placedInThemes = Number(themed?.n ?? 0);
    const leftUnsorted = Number(unsorted?.n ?? 0);
    const withQuote = Number(quoted?.n ?? 0);
    const quotesRejected = Number(meta.quotesRejected ?? 0);
    const notes = Number(boardNotes?.n ?? 0);
    const inThemes = Number(boardThemed?.n ?? 0);
    const board = { notes, inThemes, unsorted: notes - inThemes, unsortedShare: notes ? Math.round(((notes - inThemes) / notes) * 100) / 100 : 0 };

    const summary = { placedInThemes, leftUnsorted, withQuote, notReached, board };
    if (run.status === "running") await succeedRun(runId, { ...meta, ...summary });
    await touchBoard(run.boardId);

    const complete = notReached === 0;
    const processed = placedInThemes + leftUnsorted;
    return {
      runId,
      scope,
      complete,
      placedInThemes,
      leftUnsorted,
      withQuote,
      quotesRejected,
      notReached,
      board,
      message:
        `This run processed ${processed} notes: ${placedInThemes} into themes (${withQuote} with a verified quote), ${leftUnsorted} left in Unsorted.` +
        `${complete ? "" : ` ${notReached} notes were not reached.`}` +
        ` Board: ${inThemes} of ${notes} notes in themes, ${Math.round(board.unsortedShare * 100)}% Unsorted.`,
    };
  },
});
