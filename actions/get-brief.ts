import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { findBrief, loadBriefView } from "../server/lib/brief-data.js";
import { requireBoard } from "../server/lib/boards.js";

const errors = defineActionErrors("bad_request", "brief_not_found");

const metricsSchema = z.object({
  notes: z.number(),
  uniqueProblems: z.number(),
  reporters: z.number(),
  engagement: z.number(),
  recent: z.number(),
  rank: z.number().nullable(),
  score: z.number(),
  firstReported: z.string().nullable(),
  lastReported: z.string().nullable(),
  duplicateGroups: z.number(),
});

export default defineAction({
  description:
    "Get an Insight Brief (the latest for a theme, or one by id) with its verified evidence quotes and links, the SQL facts it was saved with, whether it was filed as a GitHub issue, and its Markdown (what the user copies or what gets filed).",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    briefId: z.string().optional().describe("Brief id (brf_...)"),
    theme: z.string().optional().describe("Theme id or key: returns that theme's latest brief"),
  }),
  outputSchema: z.object({
    brief: z
      .object({
        id: z.string(),
        themeId: z.string(),
        themeName: z.string().nullable(),
        title: z.string(),
        problem: z.string(),
        impact: z.string(),
        nextStep: z.string(),
        evidence: z.array(
          z.object({ noteId: z.string(), quote: z.string(), why: z.string().nullable(), title: z.string(), url: z.string().nullable(), author: z.string().nullable() }),
        ),
        metrics: metricsSchema.nullable(),
        filedIssueUrl: z.string().nullable(),
        filedAt: z.string().nullable(),
        createdAt: z.string(),
        markdown: z.string(),
      })
      .nullable(),
  }),
  errors,
  http: { method: "GET" },
  mcpAnnotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, briefId, theme }) => {
    if (!briefId && !theme) return errors.noWrite("Pass a briefId or a theme.", "bad_request");
    const board = await requireBoard(boardId, "viewer");
    const row = await findBrief(boardId, { briefId, theme });
    if (!row) return { brief: null };
    return { brief: await loadBriefView(board, row) };
  },
});
