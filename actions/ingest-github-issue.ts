import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { accessFilter } from "@agent-native/core/sharing";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, touchBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { issueFromWebhook } from "../server/lib/github.js";
import { upsertNotes } from "../server/lib/notes.js";

const errors = defineActionErrors("bad_payload", "no_matching_source");

export default defineAction({
  description:
    "Add one GitHub issue to a board from a GitHub `issues` webhook payload ({ action, issue, repository }), mapped exactly like an import. Used by the \"new issues sort themselves\" webhook automation: pass the webhook payload as-is. Finds the board whose GitHub source is that repo (or use boardId). Skips pull requests, bots and deletions with a reason. Re-delivery is safe: an issue already on the board is updated, not duplicated. When a new note is added, nextStep says how to sort it.",
  schema: z.object({
    payload: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .describe("The GitHub issues webhook payload, as received (object or JSON string)"),
    boardId: z.string().optional().describe("Board id (brd_...); defaults to the board with a GitHub source for this repo"),
  }),
  outputSchema: z.object({
    added: z.boolean(),
    updated: z.boolean(),
    skipped: z.string().nullable(),
    boardId: z.string().nullable(),
    noteId: z.string().nullable(),
    title: z.string().nullable(),
    repo: z.string().nullable(),
    nextStep: z.string(),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  retrySafe: true,
  run: async ({ payload, boardId }) => {
    let parsedPayload: unknown = payload;
    if (typeof payload === "string") {
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        return errors.noWrite("The payload is not valid JSON.", "bad_payload");
      }
    }
    const parsed = issueFromWebhook(parsedPayload);
    if (!parsed.ok) {
      return { added: false, updated: false, skipped: parsed.reason, boardId: boardId ?? null, noteId: null, title: null, repo: null, nextStep: "Nothing to sort. Stop.", message: `Skipped: ${parsed.reason}` };
    }
    const repoName = `${parsed.repo.owner}/${parsed.repo.repo}`;
    const db = getDb();
    // Only look at boards this caller can see; access to edit is checked per board below.
    const visible = await db.select({ id: schema.boards.id }).from(schema.boards).where(accessFilter(schema.boards, schema.boardShares));
    const boardIds = visible.map((b) => b.id).filter((id) => !boardId || id === boardId);
    const sources = boardIds.length
      ? await db
          .select()
          .from(schema.sources)
          .where(and(eq(schema.sources.kind, "github"), inArray(schema.sources.boardId, boardIds)))
      : [];
    const matching = sources.filter((s) => {
      const c = s.config as { owner?: string; repo?: string };
      return c.owner?.toLowerCase() === parsed.repo.owner.toLowerCase() && c.repo?.toLowerCase() === parsed.repo.repo.toLowerCase() && (!boardId || s.boardId === boardId);
    });
    // Only boards this caller can edit (access is checked per board, not trusted from the payload).
    let source: (typeof sources)[number] | null = null;
    let board: Awaited<ReturnType<typeof requireBoard>> | null = null;
    for (const s of matching) {
      try {
        board = await requireBoard(s.boardId, "editor");
        source = s;
        break;
      } catch {
        // Not this caller's board.
      }
    }
    if (!source || !board) {
      return errors.noWrite(`No board you can edit has a GitHub source for ${repoName}. Add one with add-github-source.`, "no_matching_source");
    }
    const stats = await upsertNotes(board, source.id, [parsed.note]);
    const [note] = await db
      .select({ id: schema.notes.id })
      .from(schema.notes)
      .where(and(eq(schema.notes.sourceId, source.id), eq(schema.notes.externalId, parsed.note.externalId)))
      .limit(1);
    await touchBoard(board.id);
    const added = stats.inserted > 0;
    const hasCodebook = !!(await getActiveCodebook(board.id));
    return {
      added,
      updated: stats.updated > 0,
      skipped: null,
      boardId: board.id,
      noteId: note?.id ?? null,
      title: parsed.note.title,
      repo: repoName,
      nextStep:
        added && hasCodebook
          ? `Sort the new note: start-sort-run(boardId ${board.id}, scope "new"), then follow its nextStep (it will be solo), then finish-sort-run, and reply with one line: the issue title and the theme it landed in (or Unsorted).`
          : added
            ? "The board has no themes yet; the note waits in Unsorted until a codebook exists."
            : "The issue was already on the board and is now up to date; its placement is unchanged. Nothing to sort.",
      message: added
        ? `Added "${parsed.note.title}" (${repoName}#${parsed.note.externalId}) to the board.`
        : `Updated "${parsed.note.title}" (${repoName}#${parsed.note.externalId}); it was already on the board.`,
    };
  },
});
