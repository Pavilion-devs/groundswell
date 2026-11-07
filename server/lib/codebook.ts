import { and, desc, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

export type Codebook = typeof schema.codebooks.$inferSelect;
export type Theme = typeof schema.themes.$inferSelect;

/** Colour slots, not hex: the UI phase maps slots to real colours. */
export const COLOR_SLOTS = 12;

export function colorSlot(index: number): string {
  return `slot-${(index % COLOR_SLOTS) + 1}`;
}

/**
 * Hand out colour slots, least-used first (lowest slot on ties). Always
 * returns: with more themes than slots, slots are reused evenly.
 */
export function colorPicker(existing: Array<string | null>): () => string {
  const uses = new Map<string, number>();
  for (let i = 0; i < COLOR_SLOTS; i++) uses.set(colorSlot(i), 0);
  for (const c of existing) if (c && uses.has(c)) uses.set(c, (uses.get(c) ?? 0) + 1);
  return () => {
    let best = colorSlot(0);
    for (let i = 0; i < COLOR_SLOTS; i++) {
      const slot = colorSlot(i);
      if ((uses.get(slot) ?? 0) < (uses.get(best) ?? 0)) best = slot;
    }
    uses.set(best, (uses.get(best) ?? 0) + 1);
    return best;
  };
}

/** "Install & setup errors" -> "install-setup-errors". */
export function themeKey(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "theme"
  );
}

/** Make `key` unique among `taken` by suffixing -2, -3, ... */
export function uniqueKey(key: string, taken: Set<string>): string {
  if (!taken.has(key)) return key;
  for (let i = 2; ; i++) {
    const candidate = `${key}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function getActiveCodebook(boardId: string): Promise<{ codebook: Codebook; themes: Theme[] } | null> {
  const db = getDb();
  const [codebook] = await db
    .select()
    .from(schema.codebooks)
    .where(and(eq(schema.codebooks.boardId, boardId), eq(schema.codebooks.status, "active")))
    .orderBy(desc(schema.codebooks.version))
    .limit(1);
  if (!codebook) return null;
  const themes = await db
    .select()
    .from(schema.themes)
    .where(eq(schema.themes.codebookId, codebook.id))
    .orderBy(schema.themes.createdAt, schema.themes.key);
  return { codebook, themes };
}

export async function nextCodebookVersion(boardId: string): Promise<number> {
  const [latest] = await getDb()
    .select({ version: schema.codebooks.version })
    .from(schema.codebooks)
    .where(eq(schema.codebooks.boardId, boardId))
    .orderBy(desc(schema.codebooks.version))
    .limit(1);
  return (latest?.version ?? 0) + 1;
}

/** Theme fields the agent writes, shared by save-codebook and create-theme. */
export interface ThemeInput {
  name: string;
  definition: string;
  includeRules?: string[] | undefined;
  excludeRules?: string[] | undefined;
}
