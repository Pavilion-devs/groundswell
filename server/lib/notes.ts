import { sql } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Board } from "./boards.js";
import { tenantOf } from "./boards.js";
import { hashText, newId, nowIso } from "./ids.js";

/** Longest body we store. Quote spans index into the stored body, so this is the source of truth. */
export const MAX_BODY_CHARS = 20_000;

export interface IncomingNote {
  externalId: string;
  url?: string | null;
  title?: string | null;
  body: string;
  author?: string | null;
  authorAvatar?: string | null;
  reactions?: number;
  comments?: number;
  labels?: string[];
  state?: string | null;
  sourceCreatedAt?: string | null;
}

export interface UpsertStats {
  inserted: number;
  updated: number;
}

/**
 * Insert or refresh notes for one source, keyed by (source_id, external_id).
 * Re-importing is safe: existing notes keep their id (and their placement)
 * and only their content and counters are refreshed.
 */
export async function upsertNotes(board: Board, sourceId: string, items: IncomingNote[]): Promise<UpsertStats> {
  const stats: UpsertStats = { inserted: 0, updated: 0 };
  const tenant = tenantOf(board);
  const CHUNK = 200;
  for (let i = 0; i < items.length; i += CHUNK) {
    const rows = items.slice(i, i + CHUNK).map((n) => {
      const body = (n.body ?? "").slice(0, MAX_BODY_CHARS);
      const title = n.title?.slice(0, 500) ?? null;
      return {
        id: newId("note"),
        boardId: board.id,
        sourceId,
        externalId: n.externalId,
        url: n.url ?? null,
        title,
        body,
        author: n.author ?? null,
        authorAvatar: n.authorAvatar ?? null,
        reactions: n.reactions ?? 0,
        comments: n.comments ?? 0,
        labels: n.labels ?? [],
        state: n.state ?? null,
        sourceCreatedAt: n.sourceCreatedAt ?? null,
        contentHash: hashText(`${title ?? ""}\n${body}`),
        createdAt: nowIso(),
        ...tenant,
      };
    });
    const result = await getDb()
      .insert(schema.notes)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.notes.sourceId, schema.notes.externalId],
        set: {
          url: sql`excluded.url`,
          title: sql`excluded.title`,
          body: sql`excluded.body`,
          author: sql`excluded.author`,
          authorAvatar: sql`excluded.author_avatar`,
          reactions: sql`excluded.reactions`,
          comments: sql`excluded.comments`,
          labels: sql`excluded.labels`,
          state: sql`excluded.state`,
          sourceCreatedAt: sql`excluded.source_created_at`,
          contentHash: sql`excluded.content_hash`,
        },
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    for (const r of result) {
      if (r.inserted) stats.inserted++;
      else stats.updated++;
    }
  }
  return stats;
}
