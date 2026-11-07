import { defineActionErrors } from "@agent-native/core/action";
import { eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Board, BoardRole } from "./boards.js";
import { requireBoard } from "./boards.js";
import type { Codebook, Theme } from "./codebook.js";
import { getActiveCodebook } from "./codebook.js";

export const themeErrors = defineActionErrors("theme_not_found", "theme_not_active", "no_codebook", "bad_request");

/**
 * Load a theme for editing: it must exist, its board must be reachable with
 * `role`, and it must belong to the active codebook (archived versions are
 * history and stay read-only).
 */
export async function requireActiveTheme(
  themeId: string,
  role: BoardRole = "editor",
): Promise<{ theme: Theme; board: Board; codebook: Codebook; themes: Theme[] }> {
  const [theme] = await getDb().select().from(schema.themes).where(eq(schema.themes.id, themeId)).limit(1);
  if (!theme) return themeErrors.noWrite(`Theme ${themeId} was not found.`, "theme_not_found", { statusCode: 404 });
  const board = await requireBoard(theme.boardId, role);
  const active = await getActiveCodebook(theme.boardId);
  if (!active || active.codebook.id !== theme.codebookId) {
    return themeErrors.noWrite(`Theme "${theme.name}" belongs to an older codebook version and cannot be edited.`, "theme_not_active");
  }
  return { theme, board, codebook: active.codebook, themes: active.themes };
}

/** Resolve a theme reference (id or key) within the active codebook. */
export function resolveThemeRef(themes: Theme[], ref: string): Theme | undefined {
  return themes.find((t) => t.id === ref) ?? themes.find((t) => t.key === ref);
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
