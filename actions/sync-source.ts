import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";
import { githubImportErrors, rethrowImportError } from "../server/lib/import-errors.js";
import { importGithubSource } from "../server/lib/import-github.js";

export default defineAction({
  description:
    "Re-sync a GitHub source: fetch issues created or updated since its last sync (or everything with full=true) and refresh their notes. CSV and text sources have nothing to sync.",
  schema: z.object({
    sourceId: z.string().describe("Source id (src_...)"),
    full: z
      .preprocess((v) => v === true || v === "true", z.boolean())
      .default(false)
      .describe("true to re-fetch every issue instead of only changes since the last sync; defaults to false"),
  }),
  outputSchema: z.object({
    sourceId: z.string(),
    runId: z.string(),
    fetched: z.number(),
    inserted: z.number(),
    updated: z.number(),
    incremental: z.boolean(),
    message: z.string(),
  }),
  errors: githubImportErrors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
  run: async ({ sourceId, full }) => {
    const [source] = await getDb().select().from(schema.sources).where(eq(schema.sources.id, sourceId)).limit(1);
    if (!source) return githubImportErrors.noWrite(`Source ${sourceId} was not found.`, "source_not_found", { statusCode: 404 });
    const board = await requireBoard(source.boardId, "editor");
    if (source.kind !== "github") {
      return githubImportErrors.noWrite(`${source.label} is a ${source.kind} source; re-import it instead.`, "source_not_found");
    }
    try {
      const r = await importGithubSource(board, source, { full });
      return {
        sourceId,
        runId: r.runId,
        fetched: r.fetched,
        inserted: r.inserted,
        updated: r.updated,
        incremental: r.incremental,
        message: `${source.label}: ${r.inserted} new, ${r.updated} refreshed${r.incremental ? " since the last sync" : ""}.`,
      };
    } catch (err) {
      rethrowImportError(err);
    }
  },
});
