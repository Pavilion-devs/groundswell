import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { noteText } from "../server/lib/quotes.js";
import { countPool, inSlice, poolOf, sortPool } from "../server/lib/sorting.js";

const errors = defineActionErrors("no_codebook", "bad_slice", "run_not_found", "run_closed");

export default defineAction({
  description:
    "Get the next batch of notes to sort in one slice of a sort run, with the active codebook's themes, for a sorter to classify with place-notes. Repeat until remaining is 0. Notes leave the pool as soon as they are placed.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    runId: z.string().describe("Sort run id from start-sort-run (run_...)"),
    slice: z.coerce.number().int().min(0).describe("This sorter's slice index, from start-sort-run"),
    of: z.coerce.number().int().min(1).max(8).describe("Total number of slices, from start-sort-run"),
    limit: z.coerce.number().int().min(1).max(40).default(25).describe("Batch size, 1-40; defaults to 25"),
    maxChars: z.coerce.number().int().min(300).max(4000).default(1500).describe("Characters of note text to return, 300-4000; defaults to 1500"),
    includeThemes: z
      .preprocess((v) => (v === undefined ? undefined : v === true || v === "true"), z.boolean().default(true))
      .describe("Include the codebook in the response; pass false after the first batch to save context; defaults to true"),
  }),
  outputSchema: z.object({
    codebookVersion: z.number(),
    themes: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        definition: z.string(),
        includeRules: z.array(z.string()),
        excludeRules: z.array(z.string()),
      }),
    ),
    notes: z.array(z.object({ id: z.string(), text: z.string(), labels: z.array(z.string()) })),
    remaining: z.number(),
  }),
  http: { method: "GET" },
  errors,
  run: async ({ boardId, runId, slice, of, limit, maxChars, includeThemes }) => {
    if (slice >= of) return errors.noWrite(`slice must be below of (${of}).`, "bad_slice");
    await requireBoard(boardId, "viewer");
    const [run] = await getDb()
      .select({ boardId: schema.runs.boardId, meta: schema.runs.meta, status: schema.runs.status })
      .from(schema.runs)
      .where(eq(schema.runs.id, runId))
      .limit(1);
    if (!run || run.boardId !== boardId) return errors.noWrite(`Run ${runId} is not a sort run on this board.`, "run_not_found");
    if (run.status !== "running") return errors.noWrite(`Run ${runId} is ${run.status}; stop sorting.`, "run_closed");
    const spec = poolOf(run.meta);
    const pool = sortPool(boardId, spec, runId);
    const active = await getActiveCodebook(boardId);
    if (!active) return errors.noWrite("This board has no active codebook.", "no_codebook");

    const rows = await getDb()
      .select({ id: schema.notes.id, title: schema.notes.title, body: schema.notes.body, labels: schema.notes.labels })
      .from(schema.notes)
      .leftJoin(schema.placements, eq(schema.placements.noteId, schema.notes.id))
      .where(and(pool, inSlice(slice, of)))
      .orderBy(schema.notes.id)
      .limit(limit);
    const remaining = await countPool(boardId, spec, runId, { slice, of });

    return {
      codebookVersion: active.codebook.version,
      themes: includeThemes
        ? active.themes.map((t) => ({
            key: t.key,
            name: t.name,
            definition: t.definition,
            includeRules: Array.isArray(t.includeRules) ? (t.includeRules as string[]) : [],
            excludeRules: Array.isArray(t.excludeRules) ? (t.excludeRules as string[]) : [],
          }))
        : [],
      notes: rows.map((r) => {
        const text = noteText(r);
        return {
          id: r.id,
          text: text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text,
          labels: Array.isArray(r.labels) ? (r.labels as string[]) : [],
        };
      }),
      remaining,
    };
  },
});
