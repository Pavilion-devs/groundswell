import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, tenantOf, touchBoard } from "../server/lib/boards.js";
import { colorPicker, getActiveCodebook } from "../server/lib/codebook.js";
import { loadCorrections, toParentThemes, touchedKeys } from "../server/lib/corrections.js";
import { newId, nowIso } from "../server/lib/ids.js";
import { parseDiff, planRevision, type SnapshotRow } from "../server/lib/revisions.js";
import { startRun } from "../server/lib/runs.js";
import { countPool, sorterBrief as briefFor, sortNextStep, sortPlan } from "../server/lib/sorting.js";

const errors = defineActionErrors("proposal_not_found", "not_a_proposal", "stale_proposal");

export default defineAction({
  description:
    "Apply a proposed codebook revision after the user approved it: it becomes the active codebook version, notes keep their themes by key, the corrections it used are marked learned, and a targeted re-sort run starts for the notes the revision touched (notes the user pinned never move). Follow the returned nextStep to sort, then finish-sort-run reports which notes moved. undo-codebook-revision restores the board exactly. Agents: call only after the user explicitly approves the proposal.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    codebookId: z.string().describe("The proposed codebook id (cb_...) from propose-codebook-revision"),
    slices: z.coerce.number().int().min(1).max(8).default(4).describe("How many parallel sorters the re-sort may use, 1-8; defaults to 4"),
  }),
  outputSchema: z.object({
    codebookId: z.string(),
    version: z.number(),
    applied: z.object({ updated: z.number(), added: z.number(), removed: z.number() }),
    correctionsLearned: z.number(),
    returnedToUnsorted: z.number(),
    runId: z.string().nullable(),
    total: z.number(),
    slices: z.array(z.object({ slice: z.number(), of: z.number(), notes: z.number() })),
    sorterBrief: z.string().nullable(),
    mode: z.enum(["solo", "team", "none"]),
    nextStep: z.string(),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, codebookId, slices }) => {
    const board = await requireBoard(boardId, "editor");
    const db = getDb();
    const [proposal] = await db.select().from(schema.codebooks).where(eq(schema.codebooks.id, codebookId)).limit(1);
    if (!proposal || proposal.boardId !== boardId) return errors.noWrite(`No proposal ${codebookId} on this board.`, "proposal_not_found", { statusCode: 404 });
    if (proposal.status !== "proposed") return errors.noWrite(`Codebook ${codebookId} is ${proposal.status}, not an open proposal.`, "not_a_proposal");
    const diff = parseDiff(proposal.diff);
    const active = await getActiveCodebook(boardId);
    if (!diff || !active || proposal.parentId !== active.codebook.id) {
      return errors.noWrite("The codebook changed since this was proposed. Ask for a fresh proposal.", "stale_proposal");
    }

    // Re-check against the board as it is now: themes may have been edited and
    // corrections used since the proposal was written.
    const pending = await loadCorrections(boardId, { pendingOnly: true, limit: 200 });
    const pendingIds = new Set(pending.map((c) => c.id));
    const plan = planRevision(toParentThemes(active.themes), diff.changes, new Set(diff.correctionIds.filter((id) => pendingIds.has(id))));
    if (!plan.ok) return errors.noWrite(`The board changed since this was proposed (${plan.errors.join(" ")}). Ask for a fresh proposal.`, "stale_proposal");
    const learned = pending.filter((c) => diff.correctionIds.includes(c.id));

    const tenant = tenantOf(board);
    const now = nowIso();
    const parentByKey = new Map(active.themes.map((t) => [t.key, t]));
    const keyById = new Map(active.themes.map((t) => [t.id, t.key]));

    // Snapshot every placement first, by theme key, so undo can restore it exactly.
    const current = await db.select().from(schema.placements).where(eq(schema.placements.boardId, boardId));
    const snapshot: SnapshotRow[] = current.map((p) => ({
      noteId: p.noteId,
      themeKey: p.themeId ? (keyById.get(p.themeId) ?? null) : null,
      suggestedKey: p.suggestedThemeId ? (keyById.get(p.suggestedThemeId) ?? null) : null,
      confidence: p.confidence,
      rationale: p.rationale,
      quoteStart: p.quoteStart,
      quoteEnd: p.quoteEnd,
      pinned: p.pinned,
      placedBy: p.placedBy,
      lastRunId: p.lastRunId,
      updatedAt: p.updatedAt,
    }));

    const nextColor = colorPicker(plan.themes.map((t) => t.color));
    const rows = plan.themes.map((t) => ({
      id: newId("thm"),
      boardId,
      codebookId,
      key: t.key,
      name: t.name,
      definition: t.definition,
      includeRules: t.includeRules,
      excludeRules: t.excludeRules,
      internal: t.internal,
      color: t.color ?? nextColor(),
      x: t.x,
      y: t.y,
      createdAt: now,
      updatedAt: now,
      ...tenant,
    }));
    const newIdByKey = new Map(rows.map((r) => [r.key, r.id]));
    const removedIds = active.themes.filter((t) => !newIdByKey.has(t.key)).map((t) => t.id);

    let returnedToUnsorted = 0;
    await db.transaction(async (tx) => {
      await tx.update(schema.codebooks).set({ status: "archived" }).where(eq(schema.codebooks.id, active.codebook.id));
      await tx
        .update(schema.codebooks)
        .set({ status: "active", appliedAt: now, restoreSnapshot: snapshot })
        .where(eq(schema.codebooks.id, codebookId));
      await tx.insert(schema.themes).values(rows);
      for (const [key, oldTheme] of parentByKey) {
        const successor = newIdByKey.get(key);
        if (!successor) continue;
        await tx
          .update(schema.placements)
          .set({ themeId: successor })
          .where(and(eq(schema.placements.boardId, boardId), eq(schema.placements.themeId, oldTheme.id)));
        await tx
          .update(schema.placements)
          .set({ suggestedThemeId: successor })
          .where(and(eq(schema.placements.boardId, boardId), eq(schema.placements.suggestedThemeId, oldTheme.id)));
      }
      if (removedIds.length) {
        // A retired theme's notes go back to Unsorted and are re-sorted, pinned ones included.
        const orphaned = await tx
          .update(schema.placements)
          .set({ themeId: null, pinned: false, confidence: null, quoteStart: null, quoteEnd: null, updatedAt: now })
          .where(and(eq(schema.placements.boardId, boardId), inArray(schema.placements.themeId, removedIds)))
          .returning({ id: schema.placements.noteId });
        returnedToUnsorted = orphaned.length;
        await tx
          .update(schema.placements)
          .set({ suggestedThemeId: null })
          .where(and(eq(schema.placements.boardId, boardId), inArray(schema.placements.suggestedThemeId, removedIds)));
      }
      if (learned.length) {
        await tx
          .update(schema.corrections)
          .set({ consumedByCodebookId: codebookId })
          .where(inArray(schema.corrections.id, learned.map((c) => c.id)));
      }
    });
    await touchBoard(boardId);

    // Re-sort only what the revision touched, plus Unsorted.
    const keys = touchedKeys(plan.diff, learned);
    const themeIds = rows.filter((r) => keys.has(r.key)).map((r) => r.id);
    const spec = { scope: "revision" as const, themeIds };
    const total = await countPool(boardId, spec, null);
    const applied = { updated: 0, added: 0, removed: 0 };
    for (const e of plan.diff) applied[e.op === "update" ? "updated" : e.op === "add" ? "added" : "removed"]++;
    const head = `Applied codebook v${proposal.version}: ${applied.updated} sharpened, ${applied.added} added, ${applied.removed} removed; ${learned.length} correction${learned.length === 1 ? "" : "s"} learned.`;

    if (total === 0) {
      return {
        codebookId,
        version: proposal.version,
        applied,
        correctionsLearned: learned.length,
        returnedToUnsorted,
        runId: null,
        total: 0,
        slices: [],
        sorterBrief: null,
        mode: "none" as const,
        nextStep: "Nothing needs re-sorting. Tell the user what changed; they can undo with undo-codebook-revision.",
        message: `${head} No notes needed re-sorting.`,
      };
    }

    const { of, mode } = sortPlan(total, slices);
    const perSlice = await Promise.all(
      Array.from({ length: of }, async (_, slice) => ({ slice, of, notes: await countPool(boardId, spec, null, { slice, of }) })),
    );
    const runId = await startRun(
      board,
      "resort",
      { codebookId, version: proposal.version, revisionOf: active.codebook.id, slices: of, scope: "revision", themeIds },
      total,
    );
    const sorterBrief = briefFor(boardId, runId, proposal.version, "revision");
    return {
      codebookId,
      version: proposal.version,
      applied,
      correctionsLearned: learned.length,
      returnedToUnsorted,
      runId,
      total,
      slices: perSlice,
      sorterBrief,
      mode,
      nextStep: sortNextStep(runId, total, of, mode),
      message: `${head} Re-sorting ${total} notes in the touched themes and Unsorted across ${of} slice${of === 1 ? "" : "s"}.`,
    };
  },
});
