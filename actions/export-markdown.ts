import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { findBrief, loadBriefView } from "../server/lib/brief-data.js";
import { requireBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { parseWeights, rankThemes } from "../server/lib/priorities.js";
import { themeStats } from "../server/lib/theme-stats.js";

const errors = defineActionErrors("brief_not_found");

export default defineAction({
  description:
    "Export Markdown to copy or share: one Insight Brief (briefId or theme), or, with neither, a board report (priority table with the SQL facts, each theme's definition, and the latest brief titles and filed issues). Deterministic: no model writes any of it.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    briefId: z.string().optional().describe("Export this brief"),
    theme: z.string().optional().describe("Export this theme's latest brief"),
  }),
  outputSchema: z.object({ kind: z.enum(["brief", "board"]), markdown: z.string(), message: z.string() }),
  errors,
  http: { method: "GET" },
  mcpAnnotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, briefId, theme }) => {
    const board = await requireBoard(boardId, "viewer");
    if (briefId || theme) {
      const row = await findBrief(boardId, { briefId, theme });
      if (!row) return errors.noWrite("No brief found for that theme yet.", "brief_not_found", { statusCode: 404 });
      const view = await loadBriefView(board, row);
      return { kind: "brief" as const, markdown: view.markdown, message: `Markdown for "${view.title}".` };
    }

    const active = await getActiveCodebook(boardId);
    const themes = active?.themes ?? [];
    const ranked = rankThemes(await themeStats(boardId, themes), parseWeights(board.priorityWeights));
    const briefs = await getDb().select().from(schema.briefs).where(eq(schema.briefs.boardId, boardId)).orderBy(desc(schema.briefs.createdAt));
    const keyOfThemeId = new Map(
      (await getDb().select({ id: schema.themes.id, key: schema.themes.key }).from(schema.themes).where(eq(schema.themes.boardId, boardId))).map((t) => [t.id, t.key]),
    );
    const latestByKey = new Map<string, (typeof briefs)[number]>();
    for (const b of briefs) {
      const key = keyOfThemeId.get(b.themeId);
      if (key && !latestByKey.has(key)) latestByKey.set(key, b);
    }
    const byId = new Map(themes.map((t) => [t.id, t]));
    const feedback = ranked.filter((r) => r.rank !== null);
    const internal = ranked.filter((r) => r.rank === null);
    const lines = [
      `# ${board.title}`,
      "",
      `_Priorities exported ${new Date().toISOString().slice(0, 10)}${active ? ` · codebook v${active.codebook.version}` : ""}. Every number is counted from the linked reports._`,
      "",
      "| # | Theme | Score | Notes | Distinct problems | Reporters | Engagement | Recent | Brief |",
      "|---|---|---|---|---|---|---|---|---|",
      ...feedback.map((r) => {
        const b = latestByKey.get(r.key);
        const brief = b ? (b.filedIssueUrl ? `[filed](${b.filedIssueUrl})` : "written") : "";
        return `| ${r.rank} | ${r.name} | ${r.score} | ${r.notes} | ${r.uniqueProblems} | ${r.reporters} | ${r.engagement} | ${r.recent} | ${brief} |`;
      }),
      "",
      "## Themes",
      ...feedback.flatMap((r) => {
        const b = latestByKey.get(r.key);
        return ["", `### ${r.rank}. ${r.name}`, byId.get(r.themeId)?.definition ?? "", ...(b ? ["", `**Brief:** ${b.title ?? ""}${b.filedIssueUrl ? ` ([issue](${b.filedIssueUrl}))` : ""}`] : [])];
      }),
      ...(internal.length
        ? ["", "## Not product feedback", "", ...internal.map((r) => `- ${r.name} (${r.notes} notes)`)]
        : []),
    ];
    return { kind: "board" as const, markdown: lines.join("\n"), message: `Board report with ${feedback.length} ranked themes.` };
  },
});
