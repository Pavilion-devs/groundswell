import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { touchBoard } from "../server/lib/boards.js";
import { nowIso } from "../server/lib/ids.js";
import { requireActiveTheme, themeErrors } from "../server/lib/themes.js";

export default defineAction({
  description:
    "Update a theme in the active codebook: rename it, sharpen its definition or rules, or set its position on the board. Only the fields you pass change. The theme key stays the same, so notes keep their place.",
  schema: z.object({
    id: z.string().describe("Theme id (thm_...)"),
    name: z.string().trim().min(2).max(60).optional().describe("New name"),
    definition: z.string().trim().min(10).max(500).optional().describe("New definition"),
    includeRules: z.array(z.string().trim().min(3).max(200)).max(6).optional().describe("Replaces the include rules"),
    excludeRules: z.array(z.string().trim().min(3).max(200)).max(6).optional().describe("Replaces the exclude rules"),
    x: z.coerce.number().optional().describe("Board x position"),
    y: z.coerce.number().optional().describe("Board y position"),
  }),
  outputSchema: z.object({ id: z.string(), name: z.string(), changed: z.array(z.string()), message: z.string() }),
  errors: themeErrors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  run: async ({ id, ...patch }) => {
    const { theme, themes } = await requireActiveTheme(id);
    const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const changed = Object.keys(changes);
    if (changed.length === 0) return themeErrors.noWrite("Nothing to update: pass at least one field.", "bad_request");
    if (typeof changes.name === "string") {
      const clash = themes.find((t) => t.id !== id && t.name.toLowerCase() === (changes.name as string).toLowerCase());
      if (clash) return themeErrors.noWrite(`A theme called "${clash.name}" already exists.`, "bad_request");
    }
    await getDb().update(schema.themes).set({ ...changes, updatedAt: nowIso() }).where(eq(schema.themes.id, id));
    await touchBoard(theme.boardId);
    const name = typeof changes.name === "string" ? changes.name : theme.name;
    return { id, name, changed, message: `Updated "${name}" (${changed.join(", ")}).` };
  },
});
