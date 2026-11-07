export interface SampleRow {
  id: string;
  reactions: number;
  comments: number;
  sourceCreatedAt: string | null;
  createdAt: string;
}

/**
 * About a third of the sample is the most-engaged notes; the rest is an even
 * stride through the remaining notes in time order. Deterministic, so the same
 * board always yields the same sample.
 */
export function stratifiedSample<T extends SampleRow>(rows: T[], size: number): T[] {
  if (rows.length <= size) return [...rows];
  const engagement = (r: T) => r.comments + 2 * r.reactions;
  const byEngagement = [...rows].sort((a, b) => engagement(b) - engagement(a) || a.id.localeCompare(b.id));
  const loud = byEngagement.slice(0, Math.ceil(size * 0.35)).filter((r) => engagement(r) > 0);
  const taken = new Set(loud.map((r) => r.id));
  const rest = rows
    .filter((r) => !taken.has(r.id))
    .sort((a, b) => (a.sourceCreatedAt ?? a.createdAt).localeCompare(b.sourceCreatedAt ?? b.createdAt) || a.id.localeCompare(b.id));
  const need = size - loud.length;
  const stride = rest.length / need;
  const spread: T[] = [];
  for (let i = 0; i < need; i++) {
    const row = rest[Math.floor(i * stride)];
    if (row) spread.push(row);
  }
  return [...loud, ...spread];
}
