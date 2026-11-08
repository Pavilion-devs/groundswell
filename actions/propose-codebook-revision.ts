import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, tenantOf, touchBoard } from "../server/lib/boards.js";
import { getActiveCodebook, nextCodebookVersion } from "../server/lib/codebook.js";
import { loadCorrections, toParentThemes } from "../server/lib/corrections.js";
import { newId, nowIso } from "../server/lib/ids.js";
import { changeSchema, planRevision, type StoredDiff } from "../server/lib/revisions.js";
import { revisionImpact } from "../server/lib/revision-impact.js";

const errors = defineActionErrors("no_codebook", "no_pending_corrections", "invalid_revision");

const shapeSchema = z.object({
  name: z.string(),
  definition: z.string(),
  includeRules: z.array(z.string()),
  excludeRules: z.array(z.string()),
});

export default defineAction({
  description:
    "Propose a codebook revision learned from the user's corrections, as a reviewable diff. First read list-corrections and the active codebook, find the pattern behind the moves, then propose the smallest set of changes that fixes it: update a theme (sharper definition, include/exclude rules naming the sibling theme, or a rename), add a missing theme, or remove one. Every change cites the corrections it is based on. Nothing changes on the board until the user approves and apply-codebook-revision runs. A newer proposal replaces an older open one.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    summary: z.string().trim().min(10).max(600).describe("What the corrections taught you and what the revision changes, in plain words for the user"),
    changes: z.array(changeSchema).min(1).max(12).describe("The changes, one per theme"),
    correctionIds: z
      .array(z.string())
      .max(200)
      .optional()
      .describe("Corrections this revision accounts for (they are marked learned when it is applied); defaults to all pending corrections"),
  }),
  outputSchema: z.object({
    codebookId: z.string(),
    version: z.number(),
    basedOnVersion: z.number(),
    entries: z.array(
      z.object({
        op: z.enum(["update", "add", "remove"]),
        key: z.string(),
        before: shapeSchema.nullable(),
        after: shapeSchema.nullable(),
        why: z.string(),
        basedOn: z.array(z.string()),
      }),
    ),
    correctionIds: z.array(z.string()),
    impact: z.object({ notesToReSort: z.number(), themesTouched: z.array(z.string()) }),
    superseded: z.array(z.string()),
    nextStep: z.string(),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, summary, changes, correctionIds }, ctx) => {
    const board = await requireBoard(boardId, "editor");
    const active = await getActiveCodebook(boardId);
    if (!active) return errors.noWrite("This board has no codebook to revise.", "no_codebook");
    const pending = await loadCorrections(boardId, { pendingOnly: true, limit: 200 });
    if (!pending.length) {
      return errors.noWrite("There are no pending corrections to learn from. Move some notes first.", "no_pending_corrections");
    }
    const pendingIds = new Set(pending.map((c) => c.id));
    const considered = correctionIds?.length ? [...new Set(correctionIds)] : [...pendingIds];
    const notPending = considered.filter((id) => !pendingIds.has(id));
    if (notPending.length) {
      return errors.noWrite(`These corrections are not pending on this board: ${notPending.join(", ")}. Copy ids from list-corrections.`, "invalid_revision");
    }

    const plan = planRevision(toParentThemes(active.themes), changes, new Set(considered));
    if (!plan.ok) return errors.noWrite(`The revision is not valid: ${plan.errors.join(" ")}`, "invalid_revision");

    const consideredViews = pending.filter((c) => considered.includes(c.id));
    const impact = await revisionImpact(boardId, active.themes, plan.diff, consideredViews);

    const db = getDb();
    const codebookId = newId("cb");
    const version = await nextCodebookVersion(boardId);
    const diff: StoredDiff = { basedOnVersion: active.codebook.version, changes, entries: plan.diff, correctionIds: considered };
    const superseded = await db.transaction(async (tx) => {
      const older = await tx
        .update(schema.codebooks)
        .set({ status: "rejected" })
        .where(and(eq(schema.codebooks.boardId, boardId), eq(schema.codebooks.status, "proposed")))
        .returning({ id: schema.codebooks.id });
      await tx.insert(schema.codebooks).values({
        id: codebookId,
        boardId,
        version,
        status: "proposed",
        createdBy: ctx?.caller === "frontend" ? "user" : "agent",
        summary,
        diff,
        parentId: active.codebook.id,
        createdAt: nowIso(),
        ...tenantOf(board),
      });
      return older.map((o) => o.id);
    });
    await touchBoard(boardId);

    const counts = { update: 0, add: 0, remove: 0 };
    for (const e of plan.diff) counts[e.op]++;
    const parts = [
      counts.update ? `${counts.update} theme${counts.update === 1 ? "" : "s"} sharpened` : "",
      counts.add ? `${counts.add} added` : "",
      counts.remove ? `${counts.remove} removed` : "",
    ].filter(Boolean);
    return {
      codebookId,
      version,
      basedOnVersion: active.codebook.version,
      entries: plan.diff,
      correctionIds: considered,
      impact,
      superseded,
      nextStep:
        "Show the user this proposal in plain words: one line per change with its why, and how many notes would be re-sorted. Ask them to approve. Only after an explicit yes call apply-codebook-revision(boardId, codebookId); if they decline, call reject-codebook-revision.",
      message: `Proposed codebook v${version} (from v${active.codebook.version}): ${parts.join(", ")}, learned from ${considered.length} correction${considered.length === 1 ? "" : "s"}. Applying it would re-sort ${impact.notesToReSort} notes. Waiting for the user's approval.`,
    };
  },
});
