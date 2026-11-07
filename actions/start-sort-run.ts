import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { requireBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { startRun } from "../server/lib/runs.js";
import { countPool } from "../server/lib/sorting.js";

const errors = defineActionErrors("no_codebook", "nothing_to_sort");

export default defineAction({
  description:
    "Start sorting a board's notes into its active codebook's themes. scope \"new\" sorts notes never placed; scope \"unsorted\" re-sorts those plus notes left in Unsorted (use it after adding themes to cover gaps; notes the user pinned are never touched). Splits the work into slices so parallel theme-sorter sub-agents can each own one: spawn one sorter per slice with the sorterBrief, runId, slice and of. Finish with finish-sort-run.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    slices: z.coerce.number().int().min(1).max(8).default(4).describe("How many parallel sorters to split the work across, 1-8; defaults to 4"),
    scope: z
      .enum(["new", "unsorted"])
      .default("new")
      .describe('"new" for never-sorted notes, "unsorted" to also re-sort notes in Unsorted; defaults to "new"'),
  }),
  outputSchema: z.object({
    runId: z.string(),
    codebookVersion: z.number(),
    total: z.number(),
    slices: z.array(z.object({ slice: z.number(), of: z.number(), notes: z.number() })),
    sorterBrief: z.string(),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, slices, scope }) => {
    const board = await requireBoard(boardId, "editor");
    const active = await getActiveCodebook(boardId);
    if (!active) return errors.noWrite("This board has no themes yet. Draft a codebook with sample-notes and save-codebook first.", "no_codebook");
    const total = await countPool(boardId, scope, null);
    if (total === 0) {
      return errors.noWrite(
        scope === "new" ? "Every note on this board has already been sorted. Use scope \"unsorted\" to re-sort Unsorted." : "Nothing is in Unsorted.",
        "nothing_to_sort",
      );
    }

    // Small boards don't need many sorters: aim for at least ~40 notes each.
    const of = Math.max(1, Math.min(slices, Math.ceil(total / 40)));
    const perSlice = await Promise.all(
      Array.from({ length: of }, async (_, slice) => ({ slice, of, notes: await countPool(boardId, scope, null, { slice, of }) })),
    );
    const runId = await startRun(board, "classify", { codebookId: active.codebook.id, version: active.codebook.version, slices: of, scope }, total);
    const sorterBrief = `Sort board ${boardId}, run ${runId}, codebook v${active.codebook.version}${scope === "unsorted" ? " (re-sorting Unsorted after new themes were added)" : ""}. For your slice: loop get-notes-for-sorting(boardId, runId, slice, of) then place-notes(boardId, runId, placements) until remaining is 0. Every themed placement needs an exact quote; resend any note listed in quoteMisses.`;
    return {
      runId,
      codebookVersion: active.codebook.version,
      total,
      slices: perSlice,
      sorterBrief,
      message: `Ready to ${scope === "unsorted" ? "re-sort" : "sort"} ${total} notes into ${active.themes.length} themes across ${of} slice${of === 1 ? "" : "s"}.`,
    };
  },
});
