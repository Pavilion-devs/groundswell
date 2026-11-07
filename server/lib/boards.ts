import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

export type Board = typeof schema.boards.$inferSelect;
export type BoardRole = "viewer" | "commenter" | "editor" | "admin" | "owner";

/**
 * Check the caller can reach a board with at least `minRole`, then return the
 * fresh row. Every action that touches a board's children goes through this.
 */
export async function requireBoard(boardId: string, minRole: BoardRole = "viewer"): Promise<Board> {
  await assertAccess("board", boardId, minRole);
  const [board] = await getDb().select().from(schema.boards).where(eq(schema.boards.id, boardId)).limit(1);
  if (!board) {
    // assertAccess already rejects unknown ids; this guards a delete race.
    throw new Error(`Board ${boardId} disappeared after its access check.`);
  }
  return board;
}

/** Tenant columns copied from the board onto every child row. */
export function tenantOf(board: Board): { ownerEmail: string; orgId: string | null } {
  return { ownerEmail: board.ownerEmail, orgId: board.orgId };
}

/** Mark a board as changed (list ordering, sync freshness). */
export async function touchBoard(boardId: string): Promise<void> {
  await getDb().update(schema.boards).set({ updatedAt: new Date().toISOString() }).where(eq(schema.boards.id, boardId));
}
