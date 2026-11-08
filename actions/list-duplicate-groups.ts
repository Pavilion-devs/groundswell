import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";
import { resolveThemeRef } from "../server/lib/themes.js";

const errors = defineActionErrors("theme_not_found");
const noteRef = z.object({ id: z.string(), title: z.string(), url: z.string().nullable() });

export default defineAction({
  description:
    "List duplicate groups on a board, optionally for one theme: each group's shared problem, its canonical note and its members (with links), and the theme the group sits in now.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    theme: z.string().optional().describe("Theme id (thm_...) or key; all themes when omitted"),
  }),
  outputSchema: z.object({
    groups: z.array(
      z.object({
        id: z.string(),
        summary: z.string().nullable(),
        theme: z.object({ id: z.string(), name: z.string() }).nullable(),
        canonical: noteRef,
        members: z.array(noteRef),
      }),
    ),
  }),
  errors,
  http: { method: "GET" },
  mcpAnnotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, theme: ref }) => {
    await requireBoard(boardId, "viewer");
    const db = getDb();
    const active = await getActiveCodebook(boardId);
    const themes = active?.themes ?? [];
    const only = ref ? resolveThemeRef(themes, ref) : undefined;
    if (ref && !only) return errors.noWrite(`No theme "${ref}" in the active codebook.`, "theme_not_found", { statusCode: 404 });
    const groups = await db.select().from(schema.duplicateGroups).where(eq(schema.duplicateGroups.boardId, boardId));
    const ids = [...new Set(groups.flatMap((g) => [g.canonicalNoteId, ...((g.memberNoteIds as string[]) ?? [])]))];
    const notes = ids.length
      ? await db
          .select({ id: schema.notes.id, title: schema.notes.title, url: schema.notes.url, themeId: schema.placements.themeId })
          .from(schema.notes)
          .leftJoin(schema.placements, eq(schema.placements.noteId, schema.notes.id))
          .where(inArray(schema.notes.id, ids))
      : [];
    const byId = new Map(notes.map((n) => [n.id, n]));
    const themeName = new Map(themes.map((t) => [t.id, t.name]));
    const ref_ = (id: string) => ({ id, title: byId.get(id)?.title ?? "(missing note)", url: byId.get(id)?.url ?? null });
    return {
      groups: groups
        .map((g) => {
          const home = byId.get(g.canonicalNoteId)?.themeId ?? null;
          return {
            id: g.id,
            summary: g.summary,
            theme: home && themeName.has(home) ? { id: home, name: themeName.get(home) ?? "" } : null,
            canonical: ref_(g.canonicalNoteId),
            members: ((g.memberNoteIds as string[]) ?? []).map(ref_),
          };
        })
        .filter((g) => !only || g.theme?.id === only.id),
    };
  },
});
