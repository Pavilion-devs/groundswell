/** Duplicate groups: several notes that report the same underlying problem. */

export interface GroupInput {
  canonicalNoteId: string;
  memberNoteIds: string[];
  summary: string;
}

export interface CleanGroup {
  canonicalNoteId: string;
  memberNoteIds: string[];
  summary: string;
}

/**
 * Validate proposed groups against the notes currently in the theme. The
 * canonical note is always a member; a group needs two or more notes; a note
 * belongs to at most one group. Everything not in the theme is rejected.
 */
export function validateGroups(
  groups: GroupInput[],
  notesInTheme: ReadonlySet<string>,
): { ok: true; groups: CleanGroup[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const seen = new Map<string, number>();
  const clean: CleanGroup[] = [];
  groups.forEach((g, i) => {
    const label = `Group ${i + 1}`;
    const members = [...new Set([g.canonicalNoteId, ...g.memberNoteIds])];
    const outside = members.filter((id) => !notesInTheme.has(id));
    if (outside.length) errors.push(`${label}: not in this theme: ${outside.join(", ")}. Copy ids from list-notes for this theme.`);
    if (members.length < 2) errors.push(`${label}: a duplicate group needs at least two notes.`);
    for (const id of members) {
      const other = seen.get(id);
      if (other !== undefined) errors.push(`${label}: note ${id} is already in group ${other + 1}.`);
      else seen.set(id, i);
    }
    clean.push({ canonicalNoteId: g.canonicalNoteId, memberNoteIds: members, summary: g.summary.trim() });
  });
  return errors.length ? { ok: false, errors } : { ok: true, groups: clean };
}
