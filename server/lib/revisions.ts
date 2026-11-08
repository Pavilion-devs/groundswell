/**
 * Codebook revisions: the pure logic behind "teach by dragging".
 *
 * A person's moves become corrections. The agent reads them and proposes a
 * revision as a structured diff (update / add / remove themes), where every
 * change cites the corrections that motivated it. Applying a revision makes a
 * new codebook version, snapshots every placement first (so undo is exact),
 * and re-sorts only the notes the revision touched.
 *
 * Nothing in this file touches the database, so it is unit-tested directly.
 */
import { z } from "zod";

import { themeKey, uniqueKey } from "./codebook.js";

/** At this many pending corrections the app suggests asking for a revision. */
export const REVISION_SUGGEST_AT = 3;

const rules = z.array(z.string().trim().min(3).max(200)).max(6);

/**
 * One change in a proposed revision. Flat (one object shape with an `op`)
 * rather than a discriminated union, which models fill in more reliably.
 */
export const changeSchema = z.object({
  op: z.enum(["update", "add", "remove"]).describe('"update" sharpens an existing theme, "add" creates one, "remove" retires one (its notes are re-sorted)'),
  themeKey: z.string().trim().optional().describe("For update and remove: the key of the theme in the active codebook"),
  name: z.string().trim().min(2).max(60).optional().describe("For add (required) or update (optional rename): the theme name"),
  definition: z.string().trim().min(10).max(500).optional().describe("For add (required) or update: the full new definition"),
  includeRules: rules.optional().describe("For add or update: the full new list of include rules"),
  excludeRules: rules.optional().describe("For add or update: the full new list of exclude rules, ideally naming the sibling theme"),
  why: z.string().trim().min(10).max(400).describe("One sentence a PM would accept: what the corrections showed and how this change fixes it"),
  basedOn: z.array(z.string()).min(1).max(50).describe("Ids of the corrections (cor_...) that motivated this change"),
});
export type Change = z.infer<typeof changeSchema>;

export interface ThemeShape {
  name: string;
  definition: string;
  includeRules: string[];
  excludeRules: string[];
}

export interface ParentTheme extends ThemeShape {
  key: string;
  internal: boolean;
  color: string | null;
  x: number | null;
  y: number | null;
}

export interface NextTheme extends ParentTheme {
  origin: "kept" | "updated" | "added";
}

export interface DiffEntry {
  op: Change["op"];
  key: string;
  before: ThemeShape | null;
  after: ThemeShape | null;
  why: string;
  basedOn: string[];
}

export type PlanResult = { ok: true; themes: NextTheme[]; diff: DiffEntry[] } | { ok: false; errors: string[] };

function shape(t: ThemeShape): ThemeShape {
  return { name: t.name, definition: t.definition, includeRules: [...t.includeRules], excludeRules: [...t.excludeRules] };
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Apply `changes` to the parent codebook's themes. Keys are stable: a renamed
 * theme keeps its key so its notes carry over. Added themes get a key that no
 * parent theme ever used, so a removed theme's notes can never leak into one.
 */
export function planRevision(parent: ParentTheme[], changes: Change[], allowedCorrectionIds: ReadonlySet<string>): PlanResult {
  const errors: string[] = [];
  if (changes.length === 0) errors.push("A revision needs at least one change.");
  const byKey = new Map(parent.map((t) => [t.key, t]));
  const touched = new Set<string>();
  const next = new Map<string, NextTheme>(parent.map((t) => [t.key, { ...t, origin: "kept" as const }]));
  const taken = new Set(parent.map((t) => t.key));
  const diff: DiffEntry[] = [];

  changes.forEach((c, i) => {
    const label = `Change ${i + 1} (${c.op})`;
    const unknown = c.basedOn.filter((id) => !allowedCorrectionIds.has(id));
    if (unknown.length) errors.push(`${label} cites corrections that are not pending on this board: ${unknown.join(", ")}.`);

    if (c.op === "add") {
      if (!c.name || !c.definition) {
        errors.push(`${label} needs a name and a definition.`);
        return;
      }
      const key = uniqueKey(themeKey(c.name), taken);
      taken.add(key);
      const after: ThemeShape = { name: c.name, definition: c.definition, includeRules: c.includeRules ?? [], excludeRules: c.excludeRules ?? [] };
      next.set(key, { ...after, key, internal: false, color: null, x: null, y: null, origin: "added" });
      diff.push({ op: "add", key, before: null, after: shape(after), why: c.why, basedOn: c.basedOn });
      return;
    }

    const key = c.themeKey ?? "";
    const before = byKey.get(key);
    if (!before) {
      errors.push(`${label}: no theme with key "${key}" in the active codebook.`);
      return;
    }
    if (touched.has(key)) {
      errors.push(`${label}: theme "${key}" already has a change; use one change per theme.`);
      return;
    }
    touched.add(key);

    if (c.op === "remove") {
      next.delete(key);
      diff.push({ op: "remove", key, before: shape(before), after: null, why: c.why, basedOn: c.basedOn });
      return;
    }

    const after: ThemeShape = {
      name: c.name ?? before.name,
      definition: c.definition ?? before.definition,
      includeRules: c.includeRules ?? before.includeRules,
      excludeRules: c.excludeRules ?? before.excludeRules,
    };
    const changed =
      after.name !== before.name ||
      after.definition !== before.definition ||
      !sameList(after.includeRules, before.includeRules) ||
      !sameList(after.excludeRules, before.excludeRules);
    if (!changed) {
      errors.push(`${label}: theme "${key}" would not change.`);
      return;
    }
    next.set(key, { ...before, ...after, origin: "updated" });
    diff.push({ op: "update", key, before: shape(before), after: shape(after), why: c.why, basedOn: c.basedOn });
  });

  const themes = [...next.values()];
  const names = themes.map((t) => t.name.toLowerCase());
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (dupes.length) errors.push(`Two themes would share a name: ${dupes.join(", ")}.`);
  if (themes.length < 2) errors.push("A codebook needs at least two themes.");
  return errors.length ? { ok: false, errors } : { ok: true, themes, diff };
}

/** One placement as it was just before a revision was applied. */
export interface SnapshotRow {
  noteId: string;
  themeKey: string | null;
  suggestedKey: string | null;
  confidence: number | null;
  rationale: string | null;
  quoteStart: number | null;
  quoteEnd: number | null;
  pinned: boolean;
  placedBy: "agent" | "user";
  lastRunId: string | null;
  updatedAt: string;
}

export interface CurrentRow {
  noteId: string;
  placedBy: "agent" | "user";
  pinned: boolean;
  updatedAt: string;
}

/**
 * What undo does to each note. Human edits win: a note the user placed after
 * the revision was applied keeps its new home. Every other note goes back to
 * its snapshot, and a note that had no placement before loses the one the
 * re-sort gave it.
 */
export function planRestore(
  snapshot: SnapshotRow[],
  current: CurrentRow[],
  appliedAt: string,
): { restore: SnapshotRow[]; remove: string[]; keptUserEdits: string[] } {
  const userEditedSince = new Set(
    current.filter((c) => c.placedBy === "user" && c.pinned && c.updatedAt > appliedAt).map((c) => c.noteId),
  );
  const inSnapshot = new Set(snapshot.map((s) => s.noteId));
  return {
    restore: snapshot.filter((s) => !userEditedSince.has(s.noteId)),
    remove: current.filter((c) => !inSnapshot.has(c.noteId) && !userEditedSince.has(c.noteId)).map((c) => c.noteId),
    keptUserEdits: [...userEditedSince],
  };
}

export function parseSnapshot(value: unknown): SnapshotRow[] | null {
  return Array.isArray(value) ? (value as SnapshotRow[]) : null;
}

/** The stored diff on a proposed or applied codebook. */
export interface StoredDiff {
  basedOnVersion: number;
  changes: Change[];
  entries: DiffEntry[];
  correctionIds: string[];
  rejectReason?: string;
  supersededBy?: string;
}

export function parseDiff(value: unknown): StoredDiff | null {
  const d = value as Partial<StoredDiff> | null;
  return d && Array.isArray(d.changes) && Array.isArray(d.entries) && Array.isArray(d.correctionIds) ? (d as StoredDiff) : null;
}
