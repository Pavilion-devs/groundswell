import { createHash, randomUUID } from "node:crypto";

/** Prefixed random id, e.g. `brd_3f2a…`. Prefixes make ids readable in logs. */
export function newId(prefix: "brd" | "src" | "note" | "cb" | "thm" | "cor" | "dup" | "brf" | "run"): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** Stable short hash of some text (content hashes, external ids for CSV/text rows). */
export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export function nowIso(): string {
  return new Date().toISOString();
}
