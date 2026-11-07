import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Board } from "./boards.js";
import { tenantOf } from "./boards.js";
import { newId, nowIso } from "./ids.js";
import type { Source } from "./import-github.js";

/**
 * Find a board's source of this kind and label, or create it. Re-importing the
 * same CSV or paste reuses the source, so notes upsert instead of duplicating.
 */
export async function getOrCreateSource(
  board: Board,
  kind: "csv" | "text",
  label: string,
  config: Record<string, unknown>,
): Promise<{ source: Source; created: boolean }> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.sources)
    .where(and(eq(schema.sources.boardId, board.id), eq(schema.sources.kind, kind), eq(schema.sources.label, label)))
    .limit(1);
  if (existing) {
    const [updated] = await db.update(schema.sources).set({ config }).where(eq(schema.sources.id, existing.id)).returning();
    return { source: updated ?? existing, created: false };
  }
  const [created] = await db
    .insert(schema.sources)
    .values({ id: newId("src"), boardId: board.id, kind, label, config, createdAt: nowIso(), ...tenantOf(board) })
    .returning();
  if (!created) throw new Error("Source row was not written.");
  return { source: created, created: true };
}

/** Record a finished one-shot import on its source. */
export async function markSourceImported(source: Source, stats: Record<string, unknown>): Promise<void> {
  await getDb().update(schema.sources).set({ lastSyncedAt: nowIso(), stats }).where(eq(schema.sources.id, source.id));
}
