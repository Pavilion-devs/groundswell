import type { Theme } from "./codebook.js";
import { type CorrectionView, touchedKeys } from "./corrections.js";
import type { DiffEntry } from "./revisions.js";
import { countPool } from "./sorting.js";

/**
 * How many notes applying a revision would re-sort, measured against the
 * active codebook: unpinned notes in touched or removed themes, plus Unsorted.
 */
export async function revisionImpact(
  boardId: string,
  activeThemes: Theme[],
  entries: DiffEntry[],
  corrections: CorrectionView[],
): Promise<{ notesToReSort: number; themesTouched: string[] }> {
  const keys = touchedKeys(entries, corrections);
  for (const e of entries) if (e.op === "remove") keys.add(e.key);
  const themeIds = activeThemes.filter((t) => keys.has(t.key)).map((t) => t.id);
  const notesToReSort = await countPool(boardId, { scope: "revision", themeIds }, null);
  return { notesToReSort, themesTouched: [...keys] };
}
