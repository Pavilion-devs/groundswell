import { defineAction } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { touchBoard } from "../server/lib/boards.js";
import { nowIso } from "../server/lib/ids.js";
import { requireActiveTheme, themeErrors } from "../server/lib/themes.js";

export default defineAction({
  description:
    "Merge one or more themes into another theme of the same board. Their notes move into the target (pins are kept) and the merged themes are removed. Optionally rename or redefine the target in the same step.",
  schema: z.object({
    intoThemeId: z.string().describe("Theme that survives (thm_...)"),
    themeIds: z.array(z.string()).min(1).max(10).describe("Themes to fold into it (thm_...)"),
    name: z.string().trim().min(2).max(60).optional().describe("New name for the merged theme"),
    definition: z.string().trim().min(10).max(500).optional().describe("New definition covering everything merged"),
  }),
  outputSchema: z.object({ id: z.string(), name: z.string(), notesMoved: z.number(), themesRemoved: z.number(), message: z.string() }),
  errors: themeErrors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  run: async ({ intoThemeId, themeIds, name, definition }) => {
    const { theme: target, themes } = await requireActiveTheme(intoThemeId);
    const sources = [...new Set(themeIds)].filter((id) => id !== intoThemeId);
    if (sources.length === 0) return themeErrors.noWrite("Pass at least one other theme to merge in.", "bad_request");
    const missing = sources.filter((id) => !themes.some((t) => t.id === id));
    if (missing.length) {
      return themeErrors.noWrite(`These themes are not in this board's active codebook: ${missing.join(", ")}.`, "theme_not_found", { statusCode: 404 });
    }
    if (name && themes.some((t) => t.id !== intoThemeId && !sources.includes(t.id) && t.name.toLowerCase() === name.toLowerCase())) {
      return themeErrors.noWrite(`A theme called "${name}" already exists.`, "bad_request");
    }

    const now = nowIso();
    const db = getDb();
    let notesMoved = 0;
    await db.transaction(async (tx) => {
      const moved = await tx
        .update(schema.placements)
        .set({ themeId: intoThemeId, updatedAt: now })
        .where(and(eq(schema.placements.boardId, target.boardId), inArray(schema.placements.themeId, sources)))
        .returning({ id: schema.placements.noteId });
      notesMoved = moved.length;
      await tx
        .update(schema.placements)
        .set({ suggestedThemeId: intoThemeId })
        .where(and(eq(schema.placements.boardId, target.boardId), inArray(schema.placements.suggestedThemeId, sources)));
      await tx.delete(schema.themes).where(inArray(schema.themes.id, sources));
      if (name || definition) {
        await tx
          .update(schema.themes)
          .set({ ...(name ? { name } : {}), ...(definition ? { definition } : {}), updatedAt: now })
          .where(eq(schema.themes.id, intoThemeId));
      }
    });
    await touchBoard(target.boardId);
    const finalName = name ?? target.name;
    return {
      id: intoThemeId,
      name: finalName,
      notesMoved,
      themesRemoved: sources.length,
      message: `Merged ${sources.length} theme${sources.length === 1 ? "" : "s"} into "${finalName}" (${notesMoved} notes moved).`,
    };
  },
});
