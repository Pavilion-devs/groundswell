import { defineAction } from "@agent-native/core/action";
import { readAppState, readAppStateForCurrentTab } from "@agent-native/core/application-state";
import { AGENT_SELECTION_STATE_KEY } from "@agent-native/core/shared";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireBoard } from "../server/lib/boards.js";
import { getActiveCodebook } from "../server/lib/codebook.js";

/**
 * Board selection the UI writes per tab (`selection:<TAB_ID>`):
 * the notes and themes the user has selected on a board.
 */
const selectionSchema = z.object({
  boardId: z.string(),
  noteIds: z.array(z.string()).default([]),
  themeIds: z.array(z.string()).default([]),
});

const MAX_LISTED = 40;

export default defineAction({
  description:
    "Read what the user is looking at right now: the current view, the open board (title, counts, themes with note counts) and any notes or themes they have selected. Basic navigation is already in <current-screen>; call this for a fresh read before acting on 'these notes' or 'this theme'.",
  schema: z.object({}),
  outputSchema: z.record(z.string(), z.unknown()),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = (await readAppState("navigation")) as Record<string, unknown> | null;
    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;

    const rawSelection = await readAppStateForCurrentTab("selection");
    const parsed = selectionSchema.safeParse(rawSelection);
    const picked = await readAppStateForCurrentTab(AGENT_SELECTION_STATE_KEY);
    if (picked) screen.pickedObjects = picked;

    const boardId =
      (typeof navigation?.boardId === "string" ? navigation.boardId : null) ?? (parsed.success ? parsed.data.boardId : null);
    if (!boardId) {
      return Object.keys(screen).length ? screen : { message: "No application state found. Is the app open?" };
    }

    try {
      const board = await requireBoard(boardId, "viewer");
      const active = await getActiveCodebook(boardId);
      screen.board = {
        id: board.id,
        title: board.title,
        codebookVersion: active?.codebook.version ?? null,
        themes: (active?.themes ?? []).map((t) => ({ id: t.id, key: t.key, name: t.name })),
      };
    } catch {
      screen.board = { id: boardId, unavailable: true };
      return screen;
    }

    if (parsed.success && parsed.data.boardId === boardId) {
      const { noteIds, themeIds } = parsed.data;
      const db = getDb();
      const [notes, themes] = await Promise.all([
        noteIds.length
          ? db
              .select({ id: schema.notes.id, title: schema.notes.title, themeId: schema.placements.themeId })
              .from(schema.notes)
              .leftJoin(schema.placements, eq(schema.placements.noteId, schema.notes.id))
              .where(and(eq(schema.notes.boardId, boardId), inArray(schema.notes.id, noteIds.slice(0, MAX_LISTED))))
          : Promise.resolve([]),
        themeIds.length
          ? db
              .select({ id: schema.themes.id, name: schema.themes.name })
              .from(schema.themes)
              .where(and(eq(schema.themes.boardId, boardId), inArray(schema.themes.id, themeIds)))
          : Promise.resolve([]),
      ]);
      if (noteIds.length || themeIds.length) {
        screen.selection = {
          noteCount: noteIds.length,
          notes: notes.map((n) => ({ id: n.id, title: n.title, themeId: n.themeId })),
          ...(noteIds.length > MAX_LISTED ? { allNoteIds: noteIds } : {}),
          themes,
          hint: "Act on exactly these notes/themes when the user says 'these' or 'this'. Use split-theme, merge-themes or move-notes.",
        };
      }
    }
    return screen;
  },
});
