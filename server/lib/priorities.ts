/**
 * Priority scoring. Every number here comes from SQL over the notes in a
 * theme; the model never scores. The score is transparent: each metric is
 * normalised against the biggest feedback theme, weighted, and returned with
 * its contribution so the UI (and the agent) can explain a rank.
 */
import { z } from "zod";

export const METRICS = ["volume", "reporters", "engagement", "recency"] as const;
export type Metric = (typeof METRICS)[number];
export type Weights = Record<Metric, number>;

/**
 * Defaults lean on breadth: reactions are sparse on many repos, so
 * engagement counts comments too, and distinct reporters weigh as much as
 * raw volume (one loud user filing ten issues is not ten users).
 */
export const DEFAULT_WEIGHTS: Weights = { volume: 1, reporters: 1, engagement: 1, recency: 0.5 };

/** Notes created within this many days of the board's newest note count as recent. */
export const RECENT_DAYS = 30;

export const METRIC_LABELS: Record<Metric, string> = {
  volume: "notes in the theme (duplicates collapsed)",
  reporters: "distinct people who reported it",
  engagement: "comments plus twice the reactions",
  recency: `notes from the last ${RECENT_DAYS} days`,
};

export const weightsSchema = z.object({
  volume: z.coerce.number().min(0).max(5),
  reporters: z.coerce.number().min(0).max(5),
  engagement: z.coerce.number().min(0).max(5),
  recency: z.coerce.number().min(0).max(5),
});

export function parseWeights(value: unknown): Weights {
  // Field by field: one bad weight must not discard the others.
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out: Weights = { ...DEFAULT_WEIGHTS };
  for (const m of METRICS) {
    const one = weightsSchema.shape[m].safeParse(raw[m]);
    if (raw[m] !== undefined && one.success) out[m] = one.data;
  }
  return out;
}

export interface ThemeStats {
  themeId: string;
  key: string;
  name: string;
  internal: boolean;
  notes: number;
  /** Notes minus the extra members of duplicate groups. */
  uniqueProblems: number;
  reporters: number;
  engagement: number;
  recent: number;
}

export interface RankedTheme extends ThemeStats {
  rank: number | null;
  score: number;
  breakdown: Record<Metric, { value: number; normalized: number; contribution: number }>;
}

function metricValue(s: ThemeStats, m: Metric): number {
  switch (m) {
    case "volume":
      return s.uniqueProblems;
    case "reporters":
      return s.reporters;
    case "engagement":
      return s.engagement;
    case "recency":
      return s.recent;
  }
}

/**
 * Score feedback themes 0-100 and rank them. Internal themes get the same
 * breakdown (normalised against feedback themes) but no rank, so CI noise
 * never tops the list.
 */
export function rankThemes(stats: ThemeStats[], weights: Weights): RankedTheme[] {
  const feedback = stats.filter((s) => !s.internal);
  const max = Object.fromEntries(METRICS.map((m) => [m, Math.max(0, ...feedback.map((s) => metricValue(s, m)))])) as Record<Metric, number>;
  const totalWeight = METRICS.reduce((sum, m) => sum + weights[m], 0);

  const scored = stats.map((s) => {
    const breakdown = Object.fromEntries(
      METRICS.map((m) => {
        const value = metricValue(s, m);
        const normalized = max[m] > 0 ? Math.min(1, value / max[m]) : 0;
        const contribution = totalWeight > 0 ? (100 * weights[m] * normalized) / totalWeight : 0;
        return [m, { value, normalized, contribution }];
      }),
    ) as RankedTheme["breakdown"];
    // Sum exact contributions, then round, so a full score is exactly 100.
    const score = round(
      METRICS.reduce((sum, m) => sum + breakdown[m].contribution, 0),
      1,
    );
    for (const m of METRICS) {
      breakdown[m] = { value: breakdown[m].value, normalized: round(breakdown[m].normalized, 3), contribution: round(breakdown[m].contribution, 1) };
    }
    return { ...s, score, breakdown, rank: null as number | null };
  });

  const ranked = scored
    .filter((s) => !s.internal)
    .sort((a, b) => b.score - a.score || b.reporters - a.reporters || a.name.localeCompare(b.name));
  ranked.forEach((s, i) => (s.rank = i + 1));
  const internal = scored.filter((s) => s.internal).sort((a, b) => b.notes - a.notes);
  return [...ranked, ...internal];
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
