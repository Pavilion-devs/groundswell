import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";
import { parseBriefBody } from "../server/lib/briefs.js";

export default defineAction({
  description:
    "List the Insight Briefs on a board, newest first: each brief's title, theme, how many verified quotes it cites, the rank and score it was saved with, and whether it was filed as a GitHub issue. Open one with get-brief.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    limit: z.coerce.number().int().min(1).max(200).default(50).describe("How many, newest first; defaults to 50"),
  }),
  outputSchema: z.object({
    briefs: z.array(
      z.object({
        id: z.string(),
        themeId: z.string(),
        themeName: z.string().nullable(),
        title: z.string(),
        evidence: z.number(),
        rank: z.number().nullable(),
        score: z.number().nullable(),
        filedIssueUrl: z.string().nullable(),
        filedAt: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
  }),
  http: { method: "GET" },
  mcpAnnotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, limit }) => {
    await requireBoard(boardId, "viewer");
    const db = getDb();
    const rows = await db
      .select({ brief: schema.briefs, themeName: schema.themes.name })
      .from(schema.briefs)
      .leftJoin(schema.themes, eq(schema.themes.id, schema.briefs.themeId))
      .where(eq(schema.briefs.boardId, boardId))
      .orderBy(desc(schema.briefs.createdAt))
      .limit(limit);
    return {
      briefs: rows.map(({ brief, themeName }) => {
        const metrics = (brief.metrics as { rank?: number | null; score?: number } | null) ?? null;
        return {
          id: brief.id,
          themeId: brief.themeId,
          themeName: themeName ?? null,
          title: brief.title ?? themeName ?? "Insight Brief",
          evidence: parseBriefBody(brief.body)?.evidence.length ?? 0,
          rank: metrics?.rank ?? null,
          score: typeof metrics?.score === "number" ? metrics.score : null,
          filedIssueUrl: brief.filedIssueUrl,
          filedAt: brief.filedAt,
          createdAt: brief.createdAt,
        };
      }),
    };
  },
});
