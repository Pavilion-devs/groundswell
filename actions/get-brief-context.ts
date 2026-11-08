import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { briefMetrics } from "../server/lib/brief-data.js";
import { requireBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { noteText, quoteOf } from "../server/lib/quotes.js";
import { asStringArray, resolveThemeRef } from "../server/lib/themes.js";

const errors = defineActionErrors("no_codebook", "theme_not_found");

export default defineAction({
  description:
    "Everything needed to write an Insight Brief for one theme in a single call: the theme's definition, its SQL facts (notes, distinct problems, reporters, engagement, rank and score), its duplicate groups, and its most-engaged notes with their text, links, authors and already-verified quotes. Read this, then write the brief with save-brief.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    theme: z.string().describe("Theme id (thm_...) or key"),
    limit: z.coerce.number().int().min(5).max(40).default(20).describe("How many notes to include, most-engaged first; defaults to 20"),
    maxChars: z.coerce.number().int().min(300).max(3000).default(1200).describe("Characters of each note's text; defaults to 1200"),
  }),
  outputSchema: z.object({
    theme: z.object({
      id: z.string(),
      key: z.string(),
      name: z.string(),
      definition: z.string(),
      includeRules: z.array(z.string()),
      internal: z.boolean(),
    }),
    metrics: z.object({
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
    }),
    duplicateGroups: z.array(z.object({ summary: z.string().nullable(), canonicalNoteId: z.string(), memberNoteIds: z.array(z.string()) })),
    notes: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string().nullable(),
        author: z.string().nullable(),
        comments: z.number(),
        reactions: z.number(),
        createdAt: z.string().nullable(),
        pinned: z.boolean(),
        quote: z.string().nullable(),
        text: z.string(),
      }),
    ),
    nextStep: z.string(),
  }),
  errors,
  http: { method: "GET" },
  mcpAnnotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, theme: ref, limit, maxChars }) => {
    const board = await requireBoard(boardId, "viewer");
    const active = await getActiveCodebook(boardId);
    if (!active) return errors.noWrite("This board has no themes yet.", "no_codebook");
    const theme = resolveThemeRef(active.themes, ref);
    if (!theme) return errors.noWrite(`No theme "${ref}" in the active codebook.`, "theme_not_found", { statusCode: 404 });
    const db = getDb();
    const n = schema.notes;
    const p = schema.placements;
    const [metrics, rows, groups] = await Promise.all([
      briefMetrics(board, theme, active.themes),
      db
        .select({
          id: n.id,
          title: n.title,
          body: n.body,
          url: n.url,
          author: n.author,
          comments: n.comments,
          reactions: n.reactions,
          createdAt: n.sourceCreatedAt,
          pinned: p.pinned,
          quoteStart: p.quoteStart,
          quoteEnd: p.quoteEnd,
        })
        .from(p)
        .innerJoin(n, eq(n.id, p.noteId))
        .where(and(eq(p.boardId, boardId), eq(p.themeId, theme.id)))
        .orderBy(desc(sql`${n.comments} + 2 * ${n.reactions}`), desc(n.sourceCreatedAt))
        .limit(limit),
      db.select().from(schema.duplicateGroups).where(eq(schema.duplicateGroups.boardId, boardId)),
    ]);
    const inTheme = new Set(
      (await db.select({ id: p.noteId }).from(p).where(and(eq(p.boardId, boardId), eq(p.themeId, theme.id)))).map((r) => r.id),
    );
    return {
      theme: {
        id: theme.id,
        key: theme.key,
        name: theme.name,
        definition: theme.definition,
        includeRules: asStringArray(theme.includeRules),
        internal: theme.internal,
      },
      metrics,
      duplicateGroups: groups
        .filter((g) => inTheme.has(g.canonicalNoteId))
        .map((g) => ({ summary: g.summary, canonicalNoteId: g.canonicalNoteId, memberNoteIds: asStringArray(g.memberNoteIds) })),
      notes: rows.map((r) => {
        const text = noteText(r);
        return {
          id: r.id,
          title: r.title ?? "(untitled)",
          url: r.url,
          author: r.author,
          comments: r.comments,
          reactions: r.reactions,
          createdAt: r.createdAt,
          pinned: r.pinned,
          quote: quoteOf(text, r.quoteStart, r.quoteEnd),
          text: text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text,
        };
      }),
      nextStep: theme.internal
        ? "This theme is marked internal (not product feedback); briefs are for feedback themes. Tell the user, and only continue if they insist and unmark it with update-theme."
        : "Write the brief and call save-brief. Problem and impact in plain words without counts (the brief shows the SQL facts itself); 3-6 evidence quotes copied exactly from these notes' text, from different reporters where possible; one concrete next step.",
    };
  },
});
