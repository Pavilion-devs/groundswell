import { defineAction } from "@agent-native/core/action";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, tenantOf } from "../server/lib/boards.js";
import { parseRepo } from "../server/lib/github.js";
import { newId, nowIso } from "../server/lib/ids.js";
import { githubImportErrors, rethrowImportError } from "../server/lib/import-errors.js";
import { importGithubSource, type GithubSourceConfig } from "../server/lib/import-github.js";

export default defineAction({
  description:
    "Import a public GitHub repository's issues onto a board as notes (pull requests are skipped). Calling it again for the same repo on the same board re-syncs instead of duplicating. Returns import counts and the run id.",
  searchHints: ["github issues", "import repo", "connect repository"],
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    repo: z.string().describe('Repository as "owner/name" or a github.com URL, e.g. "BuilderIO/agent-native"'),
    state: z
      .enum(["open", "closed", "all"])
      .default("all")
      .describe('Which issues to import: "open", "closed" or "all"; defaults to "all"'),
    maxIssues: z.coerce
      .number()
      .int()
      .min(1)
      .max(5000)
      .default(2000)
      .describe("Stop after this many issues, newest first; defaults to 2000, max 5000"),
    excludeBots: z
      .preprocess((v) => (v === undefined ? undefined : v === true || v === "true"), z.boolean().default(true))
      .describe("Skip issues opened by bots (CI and health-check reports); defaults to true"),
  }),
  outputSchema: z.object({
    sourceId: z.string(),
    runId: z.string(),
    repo: z.string(),
    created: z.boolean(),
    fetched: z.number(),
    inserted: z.number(),
    updated: z.number(),
    botsSkipped: z.number(),
    api: z.enum(["graphql", "search"]),
    truncated: z.boolean(),
    message: z.string(),
  }),
  errors: githubImportErrors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
  run: async ({ boardId, repo, state, maxIssues, excludeBots }) => {
    const ref = parseRepo(repo);
    if (!ref) return githubImportErrors.noWrite(`"${repo}" is not a GitHub repo. Use "owner/name".`, "invalid_repo");
    const board = await requireBoard(boardId, "editor");
    const db = getDb();
    const label = `${ref.owner}/${ref.repo}`;

    // Same repo on the same board: reuse the source (idempotent re-sync).
    const [existing] = await db
      .select()
      .from(schema.sources)
      .where(
        and(
          eq(schema.sources.boardId, boardId),
          eq(schema.sources.kind, "github"),
          sql`lower(${schema.sources.label}) = lower(${label})`,
        ),
      )
      .limit(1);

    const config: GithubSourceConfig = { owner: ref.owner, repo: ref.repo, state, maxIssues, excludeBots };
    let source = existing;
    if (!source) {
      [source] = await db
        .insert(schema.sources)
        .values({ id: newId("src"), boardId, kind: "github", config, label, createdAt: nowIso(), ...tenantOf(board) })
        .returning();
    } else {
      [source] = await db.update(schema.sources).set({ config }).where(eq(schema.sources.id, source.id)).returning();
    }
    if (!source) throw new Error("Source row was not written.");

    try {
      const result = await importGithubSource(board, source);
      const more = !result.truncated
        ? ""
        : result.api === "search"
          ? " GitHub's anonymous search stops at 1,000 issues; add a GitHub token to import the rest."
          : ` Stopped at ${maxIssues}; raise maxIssues to import more.`;
      const bots = result.botsSkipped ? ` Skipped ${result.botsSkipped} bot-filed issues.` : "";
      return {
        sourceId: source.id,
        runId: result.runId,
        repo: label,
        created: !existing,
        fetched: result.fetched,
        inserted: result.inserted,
        updated: result.updated,
        botsSkipped: result.botsSkipped,
        api: result.api,
        truncated: result.truncated,
        message: `Imported ${result.inserted} new and refreshed ${result.updated} issues from ${label}.${bots}${more}`,
      };
    } catch (err) {
      rethrowImportError(err);
    }
  },
});
