import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";
import { noteText, quoteOf } from "../server/lib/quotes.js";

const errors = defineActionErrors("note_not_found");

export default defineAction({
  description: "Get one note's full text and metadata, plus where it is placed: theme (or the suggested theme if it was left in Unsorted), confidence, the verified evidence quote, rationale, and whether the user pinned it.",
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
        suggestedThemeId: z.string().nullable(),
        confidence: z.number().nullable(),
        quote: z.string().nullable(),
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
        suggestedThemeId: schema.placements.suggestedThemeId,
        confidence: schema.placements.confidence,
        quoteStart: schema.placements.quoteStart,
        quoteEnd: schema.placements.quoteEnd,
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
      placement: placement
        ? {
            themeId: placement.themeId,
            suggestedThemeId: placement.suggestedThemeId,
            confidence: placement.confidence,
            quote: quoteOf(noteText(note), placement.quoteStart, placement.quoteEnd),
            rationale: placement.rationale,
            pinned: placement.pinned,
            placedBy: placement.placedBy,
          }
        : null,
    };
  },
});
