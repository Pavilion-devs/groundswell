import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { requireBoard, touchBoard } from "../server/lib/boards.js";
import { hashText } from "../server/lib/ids.js";
import { type IncomingNote, upsertNotes } from "../server/lib/notes.js";
import { failRun, startRun, succeedRun } from "../server/lib/runs.js";
import { getOrCreateSource, markSourceImported } from "../server/lib/sources.js";

const MAX_TEXT_CHARS = 1_000_000;
const errors = defineActionErrors("text_too_large", "text_empty");

export default defineAction({
  description:
    "Import pasted feedback (interview notes, a Slack thread, a list of quotes) onto a board, split into one note per paragraph or per line. Pasting the same text again under the same label does not create duplicates.",
  searchHints: ["paste feedback", "interview notes", "quotes"],
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    text: z.string().describe("The pasted feedback"),
    label: z.string().trim().min(1).max(120).default("Pasted feedback").describe('Name for this source; defaults to "Pasted feedback"'),
    split: z
      .enum(["paragraph", "line"])
      .default("paragraph")
      .describe('"paragraph" splits on blank lines, "line" makes every non-empty line a note; defaults to "paragraph"'),
  }),
  outputSchema: z.object({
    sourceId: z.string(),
    runId: z.string(),
    inserted: z.number(),
    updated: z.number(),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  run: async ({ boardId, text, label, split }) => {
    if (text.length > MAX_TEXT_CHARS) {
      return errors.noWrite("That is more than 1 MB of text. Import it as a CSV instead.", "text_too_large", { statusCode: 413 });
    }
    const chunks = (split === "line" ? text.split(/\r?\n/) : text.split(/\r?\n\s*\r?\n/))
      .map((c) => c.trim().replace(/^[-*•]\s+/, ""))
      .filter((c) => c.length >= 3);
    if (chunks.length === 0) return errors.noWrite("There is no feedback in that text.", "text_empty");

    const board = await requireBoard(boardId, "editor");
    const seen = new Set<string>();
    const notes: IncomingNote[] = [];
    for (const body of chunks) {
      const externalId = `h_${hashText(body)}`;
      if (seen.has(externalId)) continue;
      seen.add(externalId);
      notes.push({ externalId, body });
    }

    const { source } = await getOrCreateSource(board, "text", label, { split });
    const runId = await startRun(board, "import", { sourceId: source.id, label }, notes.length);
    try {
      const stats = await upsertNotes(board, source.id, notes);
      await markSourceImported(source, { notes: stats.inserted + stats.updated });
      await touchBoard(board.id);
      await succeedRun(runId, { sourceId: source.id, label, ...stats });
      return {
        sourceId: source.id,
        runId,
        inserted: stats.inserted,
        updated: stats.updated,
        message: `Added ${stats.inserted} notes from "${label}"${stats.updated ? ` (${stats.updated} were already on the board)` : ""}.`,
      };
    } catch (err) {
      await failRun(runId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
});
