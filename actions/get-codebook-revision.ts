import { defineAction } from "@agent-native/core/action";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { countPendingCorrections, loadCorrections } from "../server/lib/corrections.js";
import { revisionImpact } from "../server/lib/revision-impact.js";
import { parseDiff, parseSnapshot } from "../server/lib/revisions.js";

const shapeSchema = z.object({ name: z.string(), definition: z.string(), includeRules: z.array(z.string()), excludeRules: z.array(z.string()) });
const themeRef = z.object({ key: z.string(), name: z.string() }).nullable();

export default defineAction({
  description:
    "Get the open codebook revision proposal for a board (or a specific one by id) as a before/after diff, with the corrections behind each change and how many notes applying it would re-sort. Also says whether the active codebook came from a revision that can still be undone, and how many corrections are pending.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    codebookId: z.string().optional().describe("A specific proposal (cb_...); defaults to the open one"),
  }),
  outputSchema: z.object({
    proposal: z
      .object({
        codebookId: z.string(),
        version: z.number(),
        basedOnVersion: z.number(),
        status: z.string(),
        summary: z.string().nullable(),
        createdAt: z.string(),
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
        corrections: z.array(
          z.object({ id: z.string(), noteId: z.string(), noteTitle: z.string(), from: themeRef, to: themeRef, reason: z.string().nullable() }),
        ),
        impact: z.object({ notesToReSort: z.number(), themesTouched: z.array(z.string()) }).nullable(),
        rejectReason: z.string().nullable(),
      })
      .nullable(),
    undoable: z.object({ codebookId: z.string(), version: z.number(), appliedAt: z.string() }).nullable(),
    pendingCorrections: z.number(),
  }),
  http: { method: "GET" },
  mcpAnnotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, codebookId }) => {
    await requireBoard(boardId, "viewer");
    const db = getDb();
    const [row] = codebookId
      ? await db
          .select()
          .from(schema.codebooks)
          .where(and(eq(schema.codebooks.id, codebookId), eq(schema.codebooks.boardId, boardId)))
          .limit(1)
      : await db
          .select()
          .from(schema.codebooks)
          .where(and(eq(schema.codebooks.boardId, boardId), eq(schema.codebooks.status, "proposed")))
          .orderBy(desc(schema.codebooks.version))
          .limit(1);
    const [active, pendingCorrections] = await Promise.all([getActiveCodebook(boardId), countPendingCorrections(boardId)]);
    const undoable =
      active && active.codebook.appliedAt && parseSnapshot(active.codebook.restoreSnapshot)
        ? { codebookId: active.codebook.id, version: active.codebook.version, appliedAt: active.codebook.appliedAt }
        : null;

    const diff = row ? parseDiff(row.diff) : null;
    if (!row || !diff) return { proposal: null, undoable, pendingCorrections };

    const corrections = await loadCorrections(boardId, { ids: diff.correctionIds, limit: 200 });
    const impact =
      row.status === "proposed" && active && active.codebook.id === row.parentId
        ? await revisionImpact(boardId, active.themes, diff.entries, corrections)
        : null;
    return {
      proposal: {
        codebookId: row.id,
        version: row.version,
        basedOnVersion: diff.basedOnVersion,
        status: row.status,
        summary: row.summary,
        createdAt: row.createdAt,
        entries: diff.entries,
        corrections: corrections.map((c) => ({ id: c.id, noteId: c.noteId, noteTitle: c.noteTitle, from: c.from, to: c.to, reason: c.reason })),
        impact,
        rejectReason: diff.rejectReason ?? null,
      },
      undoable,
      pendingCorrections,
    };
  },
});
