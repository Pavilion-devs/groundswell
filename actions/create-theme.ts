import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard, tenantOf, touchBoard } from "../server/lib/boards.js";
import { colorPicker, getActiveCodebook, nextCodebookVersion, themeKey, uniqueKey } from "../server/lib/codebook.js";
import { newId, nowIso } from "../server/lib/ids.js";
import { themeErrors } from "../server/lib/themes.js";

export default defineAction({
  description:
    "Add one theme to a board's active codebook (or start a codebook with it if the board has none). Use move-notes afterwards to put notes in it, or start-sort-run to let sorters use it.",
  schema: z.object({
    boardId: z.string().describe("Board id (brd_...)"),
    name: z.string().trim().min(2).max(60).describe("Theme name"),
    definition: z.string().trim().min(10).max(500).describe("What a note must be about to belong here"),
    includeRules: z.array(z.string().trim().min(3).max(200)).max(6).optional().describe("Signals that put a note here"),
    excludeRules: z.array(z.string().trim().min(3).max(200)).max(6).optional().describe("Near-misses that belong elsewhere"),
  }),
  outputSchema: z.object({ id: z.string(), key: z.string(), name: z.string(), message: z.string() }),
  errors: themeErrors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ boardId, name, definition, includeRules, excludeRules }, ctx) => {
    const board = await requireBoard(boardId, "editor");
    const tenant = tenantOf(board);
    const active = await getActiveCodebook(boardId);
    if (active?.themes.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      return themeErrors.noWrite(`A theme called "${name}" already exists.`, "bad_request");
    }
    const db = getDb();
    const now = nowIso();
    let codebookId = active?.codebook.id;
    if (!codebookId) {
      codebookId = newId("cb");
      await db.insert(schema.codebooks).values({
        id: codebookId,
        boardId,
        version: await nextCodebookVersion(boardId),
        status: "active",
        createdBy: ctx?.caller === "frontend" ? "user" : "agent",
        summary: "Started by hand.",
        createdAt: now,
        ...tenant,
      });
    }
    const themes = active?.themes ?? [];
    const key = uniqueKey(themeKey(name), new Set(themes.map((t) => t.key)));
    const id = newId("thm");
    await db.insert(schema.themes).values({
      id,
      boardId,
      codebookId,
      key,
      name,
      definition,
      includeRules: includeRules ?? [],
      excludeRules: excludeRules ?? [],
      color: colorPicker(themes.map((t) => t.color))(),
      createdAt: now,
      updatedAt: now,
      ...tenant,
    });
    await touchBoard(boardId);
    return { id, key, name, message: `Added theme "${name}".` };
  },
});
