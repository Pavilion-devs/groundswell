import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { touchBoard } from "../server/lib/boards.js";
import { nowIso } from "../server/lib/ids.js";
import { requireActiveTheme, themeErrors } from "../server/lib/themes.js";

export default defineAction({
  description:
    "Remove a theme from the active codebook. Its notes are not deleted: they return to Unsorted (unpinned) so they can be sorted again or moved by hand.",
  schema: z.object({ id: z.string().describe("Theme id (thm_...)") }),
  outputSchema: z.object({ id: z.string(), name: z.string(), returnedToUnsorted: z.number(), message: z.string() }),
  errors: themeErrors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  run: async ({ id }) => {
    const { theme } = await requireActiveTheme(id);
    const now = nowIso();
    let returned = 0;
    await getDb().transaction(async (tx) => {
      const rows = await tx
        .update(schema.placements)
        .set({ themeId: null, pinned: false, confidence: null, quoteStart: null, quoteEnd: null, updatedAt: now })
        .where(eq(schema.placements.themeId, id))
        .returning({ id: schema.placements.noteId });
      returned = rows.length;
      await tx.update(schema.placements).set({ suggestedThemeId: null }).where(eq(schema.placements.suggestedThemeId, id));
      await tx.delete(schema.themes).where(eq(schema.themes.id, id));
    });
    await touchBoard(theme.boardId);
    return { id, name: theme.name, returnedToUnsorted: returned, message: `Removed "${theme.name}"; ${returned} notes are back in Unsorted.` };
  },
});
