import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";
import { noteText } from "../server/lib/quotes.js";
import { stratifiedSample } from "../server/lib/sampling.js";

export default defineAction({
  description:
    "Get a representative sample of a board's notes for drafting a codebook (the set of themes). The sample mixes the most-discussed notes with an even spread across time, so both loud and quiet problems show up. Read it fully before calling save-codebook.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    size: z.coerce.number().int().min(20).max(250).default(120).describe("How many notes to sample, 20-250; defaults to 120"),
    maxChars: z.coerce.number().int().min(150).max(1500).default(500).describe("Characters of text per note, 150-1500; defaults to 500"),
  }),
  outputSchema: z.object({
    totalNotes: z.number(),
    sampled: z.number(),
    notes: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        labels: z.array(z.string()),
        reactions: z.number(),
        comments: z.number(),
      }),
    ),
  }),
  http: { method: "GET" },
  run: async ({ boardId, size, maxChars }) => {
    await requireBoard(boardId, "viewer");
    const rows = await getDb()
      .select({
        id: schema.notes.id,
        title: schema.notes.title,
        body: schema.notes.body,
        labels: schema.notes.labels,
        reactions: schema.notes.reactions,
        comments: schema.notes.comments,
        sourceCreatedAt: schema.notes.sourceCreatedAt,
        createdAt: schema.notes.createdAt,
      })
      .from(schema.notes)
      .where(eq(schema.notes.boardId, boardId));

    const picked = stratifiedSample(rows, size);
    return {
      totalNotes: rows.length,
      sampled: picked.length,
      notes: picked.map((n) => {
        const text = noteText(n);
        return {
          id: n.id,
          text: text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text,
          labels: Array.isArray(n.labels) ? (n.labels as string[]) : [],
          reactions: n.reactions,
          comments: n.comments,
        };
      }),
    };
  },
});
