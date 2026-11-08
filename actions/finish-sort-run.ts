import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, touchBoard } from "../server/lib/boards.js";
import { succeedRun } from "../server/lib/runs.js";
import { parseSnapshot } from "../server/lib/revisions.js";
import { countPool, poolOf } from "../server/lib/sorting.js";

const errors = defineActionErrors("run_not_found", "not_a_sort_run");

export default defineAction({
  description:
    "Close a sort run (or a revision re-sort) after its sorters finish and get proof of what was saved: notes placed in a theme, notes left in Unsorted, verified quotes, notes the run never reached, the board-wide Unsorted share and, for a revision re-sort, which notes moved to a different theme. Report these numbers to the user and follow nextStep.",
  schema: z.object({ runId: z.string().describe("Sort run id (run_...)") }),
  outputSchema: z.object({
    runId: z.string(),
    scope: z.enum(["new", "unsorted", "revision"]),
    complete: z.boolean(),
    placedInThemes: z.number(),
    leftUnsorted: z.number(),
    withQuote: z.number(),
    quotesRejected: z.number(),
    notReached: z.number(),
    board: z.object({ notes: z.number(), inThemes: z.number(), unsorted: z.number(), unsortedShare: z.number() }),
    moved: z.number(),
    moves: z.array(z.object({ noteId: z.string(), title: z.string(), from: z.string().nullable(), to: z.string().nullable() })),
    moveGroups: z
      .array(z.object({ from: z.string(), to: z.string(), count: z.number(), examples: z.array(z.string()) }))
      .describe("Moves grouped by route with exact counts; quote these counts, never recount"),
    nextStep: z.string(),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  run: async ({ runId }) => {
    const db = getDb();
    const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId)).limit(1);
    if (!run) return errors.noWrite(`Run ${runId} was not found.`, "run_not_found", { statusCode: 404 });
    if (run.kind !== "classify" && run.kind !== "resort") return errors.noWrite(`Run ${runId} is a ${run.kind} run, not a sort run.`, "not_a_sort_run");
    await requireBoard(run.boardId, "editor");
    const spec = poolOf(run.meta);
    const scope = spec.scope;
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
    const notReached = await countPool(run.boardId, spec, runId);
    const moves = run.kind === "resort" ? await revisionMoves(runId, meta) : [];
    const placedInThemes = Number(themed?.n ?? 0);
    const leftUnsorted = Number(unsorted?.n ?? 0);
    const withQuote = Number(quoted?.n ?? 0);
    const quotesRejected = Number(meta.quotesRejected ?? 0);
    const notes = Number(boardNotes?.n ?? 0);
    const inThemes = Number(boardThemed?.n ?? 0);
    const board = { notes, inThemes, unsorted: notes - inThemes, unsortedShare: notes ? Math.round(((notes - inThemes) / notes) * 100) / 100 : 0 };

    // movedNoteIds drives the ripple animation on the board.
    const summary = { placedInThemes, leftUnsorted, withQuote, notReached, board, ...(run.kind === "resort" ? { movedNoteIds: moves.map((m) => m.noteId) } : {}) };
    if (run.status === "running") await succeedRun(runId, { ...meta, ...summary });
    await touchBoard(run.boardId);

    const complete = notReached === 0;
    const processed = placedInThemes + leftUnsorted;
    const report = run.kind === "resort"
      ? "Then write your reply to the user (your turn is not finished without it): what the revision changed, how many notes moved, one line per moveGroups entry with its exact count and an example or two, the board result from these numbers, and that they can undo with undo-codebook-revision. Use the counts as given; do not recount."
      : "Then write your reply to the user (your turn is not finished without it): one line with the board result from these numbers, the biggest themes from get-codebook one line each, and the next useful step.";
    const nextStep =
      scope === "new" && board.unsortedShare > 0.2
        ? `Unsorted is ${Math.round(board.unsortedShare * 100)}%, above 20%: run the coverage step of the feedback-synthesis skill once (list-notes unsorted, create-theme for real clusters, start-sort-run scope "unsorted", finish-sort-run). ${report}`
        : `${notReached > 0 ? `${notReached} notes were not reached; offer to sort them. ` : ""}${report}`;
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
      moved: moves.length,
      moves: moves.slice(0, 25),
      moveGroups: groupMoves(moves),
      nextStep,
      message:
        `This run processed ${processed} notes: ${placedInThemes} into themes (${withQuote} with a verified quote), ${leftUnsorted} left in Unsorted.` +
        `${complete ? "" : ` ${notReached} notes were not reached.`}` +
        `${run.kind === "resort" ? ` ${moves.length} note${moves.length === 1 ? "" : "s"} moved to a different theme.` : ""}` +
        ` Board: ${inThemes} of ${notes} notes in themes, ${Math.round(board.unsortedShare * 100)}% Unsorted.`,
    };
  },
});

/** Notes a revision re-sort put somewhere other than where they were before the revision. */
async function revisionMoves(runId: string, meta: Record<string, unknown>) {
  const codebookId = typeof meta.codebookId === "string" ? meta.codebookId : null;
  if (!codebookId) return [];
  const db = getDb();
  const [codebook] = await db.select({ snapshot: schema.codebooks.restoreSnapshot }).from(schema.codebooks).where(eq(schema.codebooks.id, codebookId)).limit(1);
  const before = new Map((parseSnapshot(codebook?.snapshot) ?? []).map((s) => [s.noteId, s.themeKey]));
  const rows = await db
    .select({ noteId: schema.placements.noteId, title: schema.notes.title, key: schema.themes.key, name: schema.themes.name })
    .from(schema.placements)
    .innerJoin(schema.notes, eq(schema.notes.id, schema.placements.noteId))
    .leftJoin(schema.themes, eq(schema.themes.id, schema.placements.themeId))
    .where(eq(schema.placements.lastRunId, runId));
  const names = new Map<string, string>();
  // Parent names first, so a theme the revision removed still has a readable name.
  const parentId = typeof meta.revisionOf === "string" ? meta.revisionOf : null;
  const ids = parentId ? [parentId, codebookId] : [codebookId];
  const themes = await db
    .select({ key: schema.themes.key, name: schema.themes.name, codebookId: schema.themes.codebookId })
    .from(schema.themes)
    .where(inArray(schema.themes.codebookId, ids));
  for (const t of themes.sort((a, b) => (a.codebookId === codebookId ? 1 : 0) - (b.codebookId === codebookId ? 1 : 0))) names.set(t.key, t.name);
  return rows
    .filter((r) => (before.get(r.noteId) ?? null) !== (r.key ?? null))
    .map((r) => {
      const fromKey = before.get(r.noteId) ?? null;
      return { noteId: r.noteId, title: r.title ?? "(untitled)", from: fromKey ? (names.get(fromKey) ?? fromKey) : null, to: r.name ?? null };
    });
}

/** Moves grouped by route (from → to), biggest first, with exact counts. */
function groupMoves(moves: Array<{ title: string; from: string | null; to: string | null }>) {
  const groups = new Map<string, { from: string; to: string; count: number; examples: string[] }>();
  for (const m of moves) {
    const from = m.from ?? "Unsorted";
    const to = m.to ?? "Unsorted";
    const g = groups.get(`${from}→${to}`) ?? { from, to, count: 0, examples: [] };
    g.count++;
    if (g.examples.length < 3) g.examples.push(m.title);
    groups.set(`${from}→${to}`, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
