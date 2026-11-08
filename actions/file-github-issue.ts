import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { findBrief, loadBriefView } from "../server/lib/brief-data.js";
import { requireBoard, touchBoard } from "../server/lib/boards.js";
import { createIssue, GithubError, parseRepo } from "../server/lib/github.js";
import { nowIso } from "../server/lib/ids.js";
import { getGithubToken } from "../server/lib/secrets.js";

const errors = defineActionErrors("brief_not_found", "no_target_repo", "no_github_token", "github_error", "already_filed");

export default defineAction({
  description:
    "File an Insight Brief as a GitHub issue (title and Markdown body from the brief) with the user's GitHub token. It posts publicly on the user's behalf, so it always needs the user's approval. Before calling, tell the user which repo it will go to (default: the board's GitHub source repo). dryRun=true shows the exact issue without posting and needs no approval. A brief is filed once; the result links the issue.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    briefId: z.string().optional().describe("Brief id (brf_...)"),
    theme: z.string().optional().describe("Theme id or key: files that theme's latest brief"),
    repo: z.string().optional().describe('Target repo "owner/name"; defaults to the board\'s GitHub source'),
    labels: z.array(z.string().trim().min(1).max(50)).max(5).optional().describe("Labels to add (must exist in the repo)"),
    dryRun: z
      .preprocess((v) => (v === undefined ? undefined : v === true || v === "true"), z.boolean().default(false))
      .describe("Preview the issue without posting it"),
  }),
  outputSchema: z.object({
    dryRun: z.boolean(),
    repo: z.string(),
    title: z.string(),
    body: z.string(),
    labels: z.array(z.string()),
    issueUrl: z.string().nullable(),
    issueNumber: z.number().nullable(),
    message: z.string(),
  }),
  errors,
  // Posting publicly on the user's behalf: the agent cannot run it unapproved. A dry run posts nothing.
  needsApproval: (args) => !(args as { dryRun?: boolean }).dryRun,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  run: async ({ boardId, briefId, theme, repo, labels, dryRun }) => {
    const board = await requireBoard(boardId, "editor");
    const row = await findBrief(boardId, { briefId, theme });
    if (!row) return errors.noWrite("No brief found. Write one with save-brief first.", "brief_not_found", { statusCode: 404 });
    if (row.filedIssueUrl && !dryRun) {
      return errors.noWrite(`This brief was already filed: ${row.filedIssueUrl}`, "already_filed");
    }

    let target = repo ? parseRepo(repo) : null;
    if (!target) {
      const [source] = await getDb()
        .select({ config: schema.sources.config })
        .from(schema.sources)
        .where(and(eq(schema.sources.boardId, boardId), eq(schema.sources.kind, "github")))
        .limit(1);
      const cfg = source?.config as { owner?: string; repo?: string } | undefined;
      target = cfg?.owner && cfg.repo ? { owner: cfg.owner, repo: cfg.repo } : null;
    }
    if (!target) return errors.noWrite('Say which repo to file in ("owner/name"); this board has no GitHub source.', "no_target_repo");
    const repoName = `${target.owner}/${target.repo}`;

    const view = await loadBriefView(board, row);
    const title = view.title;
    const body = view.markdown;
    const cleanLabels = labels ?? [];
    if (dryRun) {
      return {
        dryRun: true,
        repo: repoName,
        title,
        body,
        labels: cleanLabels,
        issueUrl: null,
        issueNumber: null,
        message: `Preview only: this would open "${title}" in ${repoName}. Nothing was posted.`,
      };
    }

    const token = await getGithubToken();
    if (!token) return errors.noWrite("Add a GitHub token in Settings (it needs Issues: write on the target repo) to file issues.", "no_github_token");
    let created: { number: number; url: string };
    try {
      created = await createIssue({ ...target, title, body, labels: cleanLabels }, token);
    } catch (err) {
      if (err instanceof GithubError) return errors.noWrite(err.message, "github_error");
      throw err;
    }
    await getDb().update(schema.briefs).set({ filedIssueUrl: created.url, filedAt: nowIso() }).where(eq(schema.briefs.id, row.id));
    await touchBoard(boardId);
    return {
      dryRun: false,
      repo: repoName,
      title,
      body,
      labels: cleanLabels,
      issueUrl: created.url,
      issueNumber: created.number,
      message: `Filed "${title}" as ${repoName}#${created.number}: ${created.url}`,
    };
  },
});
