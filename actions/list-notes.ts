import { defineAction } from "@agent-native/core/action";
import { and, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";
import { noteText, quoteOf } from "../server/lib/quotes.js";

const EXCERPT = 280;

export default defineAction({
  description:
    "List or search a board's notes (imported feedback), most-reacted first. Filter by source, by theme, to unsorted notes only, or by a text search over title and body. Returns short excerpts; use get-note for a full body.",
  searchHints: ["search feedback", "find issues", "browse notes"],
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    sourceId: z.string().optional().describe("Only notes from this source (src_...)"),
    themeId: z.string().optional().describe("Only notes placed in this theme (thm_...)"),
    unsorted: z
      .preprocess((v) => (v === undefined ? undefined : v === true || v === "true"), z.boolean().default(false))
      .describe("true for only notes not yet in any theme; defaults to false"),
    search: z.string().trim().max(200).optional().describe("Case-insensitive text to find in title or body"),
    sort: z
      .enum(["reactions", "newest"])
      .default("reactions")
      .describe('"reactions" (most reacted, then most commented) or "newest"; defaults to "reactions"'),
    limit: z.coerce.number().int().min(1).max(200).default(50).describe("Page size, 1-200; defaults to 50"),
    offset: z.coerce.number().int().min(0).default(0).describe("Rows to skip for paging; defaults to 0"),
  }),
  outputSchema: z.object({
    total: z.number(),
    notes: z.array(
      z.object({
        id: z.string(),
        sourceId: z.string(),
        title: z.string().nullable(),
        excerpt: z.string(),
        author: z.string().nullable(),
        url: z.string().nullable(),
        reactions: z.number(),
        comments: z.number(),
        state: z.string().nullable(),
        labels: z.array(z.string()),
        sourceCreatedAt: z.string().nullable(),
        themeId: z.string().nullable(),
        suggestedThemeId: z.string().nullable(),
        confidence: z.number().nullable(),
        pinned: z.boolean(),
        quote: z.string().nullable(),
      }),
    ),
  }),
  http: { method: "GET" },
  run: async ({ boardId, sourceId, themeId, unsorted, search, sort, limit, offset }) => {
    await requireBoard(boardId, "viewer");
    const db = getDb();
    const n = schema.notes;
    const p = schema.placements;

    const filters: SQL[] = [eq(n.boardId, boardId)];
    if (sourceId) filters.push(eq(n.sourceId, sourceId));
    if (themeId) filters.push(eq(p.themeId, themeId));
    if (unsorted) filters.push(isNull(p.themeId));
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const match = or(ilike(n.title, like), ilike(n.body, like));
      if (match) filters.push(match);
    }
    const where = and(...filters);

    const [[totalRow], rows] = await Promise.all([
      db.select({ n: count() }).from(n).leftJoin(p, eq(p.noteId, n.id)).where(where),
      db
        .select({
          id: n.id,
          sourceId: n.sourceId,
          title: n.title,
          body: n.body,
          author: n.author,
          url: n.url,
          reactions: n.reactions,
          comments: n.comments,
          state: n.state,
          labels: n.labels,
          sourceCreatedAt: n.sourceCreatedAt,
          themeId: p.themeId,
          suggestedThemeId: p.suggestedThemeId,
          confidence: p.confidence,
          pinned: p.pinned,
          quoteStart: p.quoteStart,
          quoteEnd: p.quoteEnd,
        })
        .from(n)
        .leftJoin(p, eq(p.noteId, n.id))
        .where(where)
        .orderBy(...(sort === "newest" ? [desc(n.sourceCreatedAt)] : [desc(n.reactions), desc(n.comments)]), n.id)
        .limit(limit)
        .offset(offset),
    ]);

    return {
      total: Number(totalRow?.n ?? 0),
      notes: rows.map(({ body, labels, themeId, suggestedThemeId, confidence, pinned, quoteStart, quoteEnd, ...r }) => ({
        ...r,
        excerpt: body.length > EXCERPT ? `${body.slice(0, EXCERPT).trimEnd()}…` : body,
        labels: Array.isArray(labels) ? (labels as string[]) : [],
        themeId: themeId ?? null,
        suggestedThemeId: suggestedThemeId ?? null,
        confidence: confidence ?? null,
        pinned: pinned ?? false,
        quote: quoteOf(noteText({ title: r.title, body }), quoteStart ?? null, quoteEnd ?? null),
      })),
    };
  },
});
