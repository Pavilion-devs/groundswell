import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { METRIC_LABELS, METRICS, parseWeights, rankThemes } from "../server/lib/priorities.js";
import { boardReferenceDate, themeStats } from "../server/lib/theme-stats.js";

const part = z.object({ value: z.number(), normalized: z.number(), contribution: z.number() });

export default defineAction({
  description:
    "Rank a board's themes by priority. Every number is computed in SQL from the notes in each theme: volume (duplicates collapsed), distinct reporters, engagement (comments + 2 x reactions) and recency, each normalised against the biggest theme and weighted by the board's priority weights (set-priority-weights). Each theme comes with its score breakdown so the rank can be explained. Internal themes (not product feedback) are listed after the ranked ones, without a rank. Quote these numbers as given; never estimate them.",
  schema: z.object({ boardId: z.string().describe("Board id (brd_...)") }),
  outputSchema: z.object({
    weights: z.object({ volume: z.number(), reporters: z.number(), engagement: z.number(), recency: z.number() }),
    metrics: z.array(z.object({ key: z.string(), meaning: z.string() })),
    referenceDate: z.string().nullable(),
    themes: z.array(
      z.object({
        themeId: z.string(),
        key: z.string(),
        name: z.string(),
        internal: z.boolean(),
        rank: z.number().nullable(),
        score: z.number(),
        notes: z.number(),
        uniqueProblems: z.number(),
        reporters: z.number(),
        engagement: z.number(),
        recent: z.number(),
        breakdown: z.object({ volume: part, reporters: part, engagement: part, recency: part }),
      }),
    ),
    nextStep: z.string(),
    message: z.string(),
  }),
  http: { method: "GET" },
  mcpAnnotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId }) => {
    const board = await requireBoard(boardId, "viewer");
    const active = await getActiveCodebook(boardId);
    const weights = parseWeights(board.priorityWeights);
    const metrics = METRICS.map((key) => ({ key, meaning: METRIC_LABELS[key] }));
    if (!active) return { weights, metrics, referenceDate: null, themes: [], nextStep: "Tell the user the board has no themes yet.", message: "This board has no themes yet." };
    const [stats, referenceDate] = await Promise.all([themeStats(boardId, active.themes), boardReferenceDate(boardId)]);
    const themes = rankThemes(stats, weights);
    const top = themes.filter((t) => t.rank !== null).slice(0, 3);
    return {
      weights,
      metrics,
      referenceDate,
      themes,
      nextStep:
        "Answer the user (your turn is not finished without it) with the ranked themes they asked about (rank, name, score, and the one or two metrics that drive it), quoting these numbers exactly. If an internal-looking theme (CI, trackers, chores) ranks high, suggest marking it internal.",
      message: top.length
        ? `Top priorities: ${top.map((t) => `#${t.rank} ${t.name} (${t.score})`).join(", ")}.`
        : "No feedback themes to rank yet.",
    };
  },
});
