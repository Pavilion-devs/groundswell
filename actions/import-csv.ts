import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { requireBoard, touchBoard } from "../server/lib/boards.js";
import { type CsvColumns, guessColumns, parseCsv, rowsToNotes } from "../server/lib/csv.js";
import { upsertNotes } from "../server/lib/notes.js";
import { failRun, startRun, succeedRun } from "../server/lib/runs.js";
import { getOrCreateSource, markSourceImported } from "../server/lib/sources.js";

const MAX_CSV_CHARS = 5_000_000;
const errors = defineActionErrors("csv_too_large", "csv_empty", "body_column_required", "unknown_column");

const columnsSchema = z
  .object({
    body: z.string().optional().describe("Header of the column holding the feedback text"),
    title: z.string().optional().describe("Header of a short title/subject column"),
    author: z.string().optional().describe("Header of the author/customer column"),
    url: z.string().optional().describe("Header of a link back to the original (http/https only)"),
    date: z.string().optional().describe("Header of the date the feedback was written"),
    id: z.string().optional().describe("Header of a stable row id; makes re-imports update instead of duplicate"),
    reactions: z.string().optional().describe("Header of a votes/upvotes count"),
  })
  .optional()
  .describe("Which CSV header maps to which field. Omit to auto-detect from common names (feedback, review, comment, title, author, date...)");

export default defineAction({
  description:
    "Import feedback from CSV text (support tickets, app reviews, survey answers) onto a board as notes, one row per note. Columns are auto-detected unless given. Re-importing under the same label updates rows instead of duplicating them.",
  searchHints: ["upload csv", "spreadsheet", "survey responses", "support tickets", "app store reviews"],
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    csv: z.string().describe("The CSV file contents, with a header row"),
    label: z.string().trim().min(1).max(120).describe('Name for this source, e.g. "Zendesk export Oct 2026"'),
    columns: columnsSchema,
  }),
  outputSchema: z.object({
    sourceId: z.string(),
    runId: z.string(),
    inserted: z.number(),
    updated: z.number(),
    skipped: z.number(),
    columnsUsed: z.record(z.string(), z.string()),
    message: z.string(),
  }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  run: async ({ boardId, csv, label, columns }) => {
    if (csv.length > MAX_CSV_CHARS) {
      return errors.noWrite(`CSV is larger than ${MAX_CSV_CHARS / 1_000_000} MB. Split it into smaller files.`, "csv_too_large", { statusCode: 413 });
    }
    const board = await requireBoard(boardId, "editor");
    const parsed = parseCsv(csv);
    if (parsed.rows.length === 0) return errors.noWrite("The CSV has no data rows.", "csv_empty");

    const guessed = guessColumns(parsed.headers);
    const merged = { ...guessed, ...stripEmpty(columns ?? {}) };
    for (const [field, header] of Object.entries(merged)) {
      if (header && !parsed.headers.includes(header)) {
        return errors.noWrite(`Column "${header}" (for ${field}) is not in the CSV.`, "unknown_column", { details: { headers: parsed.headers } });
      }
    }
    if (!merged.body) {
      return errors.noWrite("Could not tell which column holds the feedback text. Pass columns.body.", "body_column_required", {
        details: { headers: parsed.headers },
      });
    }
    const cols = merged as CsvColumns;
    const { notes, skipped } = rowsToNotes(parsed.rows, cols);

    const { source } = await getOrCreateSource(board, "csv", label, { columns: cols });
    const runId = await startRun(board, "import", { sourceId: source.id, label }, notes.length);
    try {
      const stats = await upsertNotes(board, source.id, notes);
      await markSourceImported(source, { notes: stats.inserted + stats.updated, skipped, parseErrors: parsed.errors });
      await touchBoard(board.id);
      await succeedRun(runId, { sourceId: source.id, label, ...stats, skipped });
      const columnsUsed = Object.fromEntries(Object.entries(cols).filter(([, v]) => typeof v === "string")) as Record<string, string>;
      return {
        sourceId: source.id,
        runId,
        inserted: stats.inserted,
        updated: stats.updated,
        skipped,
        columnsUsed,
        message: `Imported ${stats.inserted} new and updated ${stats.updated} rows from "${label}"${skipped ? `; skipped ${skipped} empty or duplicate rows` : ""}.`,
      };
    } catch (err) {
      await failRun(runId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  },
});

function stripEmpty(obj: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === "string" && v.trim() !== "")) as Record<string, string>;
}
