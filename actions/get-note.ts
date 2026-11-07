import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";

const errors = defineActionErrors("note_not_found");

export default defineAction({
  description: "Get one note's full text and metadata, plus where it is placed (theme, confidence, rationale, pinned).",
  schema: z.object({ id: z.string().describe("Note id (note_...)") }),
  outputSchema: z.object({
    id: z.string(),
    boardId: z.string(),
    sourceId: z.string(),
    externalId: z.string(),
    title: z.string().nullable(),
    body: z.string(),
    author: z.string().nullable(),
    url: z.string().nullable(),
    reactions: z.number(),
    comments: z.number(),
    state: z.string().nullable(),
    labels: z.array(z.string()),
    sourceCreatedAt: z.string().nullable(),
    placement: z
      .object({
        themeId: z.string().nullable(),
        confidence: z.number().nullable(),
        rationale: z.string().nullable(),
        pinned: z.boolean(),
        placedBy: z.string(),
      })
      .nullable(),
  }),
  http: { method: "GET" },
  errors,
  run: async ({ id }) => {
    const db = getDb();
    const [note] = await db.select().from(schema.notes).where(eq(schema.notes.id, id)).limit(1);
    if (!note) return errors.noWrite(`Note ${id} was not found.`, "note_not_found", { statusCode: 404 });
    await requireBoard(note.boardId, "viewer");
    const [placement] = await db
      .select({
        themeId: schema.placements.themeId,
        confidence: schema.placements.confidence,
        rationale: schema.placements.rationale,
        pinned: schema.placements.pinned,
        placedBy: schema.placements.placedBy,
      })
      .from(schema.placements)
      .where(eq(schema.placements.noteId, id))
      .limit(1);
    return {
      id: note.id,
      boardId: note.boardId,
      sourceId: note.sourceId,
      externalId: note.externalId,
      title: note.title,
      body: note.body,
      author: note.author,
      url: note.url,
      reactions: note.reactions,
      comments: note.comments,
      state: note.state,
      labels: Array.isArray(note.labels) ? (note.labels as string[]) : [],
      sourceCreatedAt: note.sourceCreatedAt,
      placement: placement ?? null,
    };
  },
});
