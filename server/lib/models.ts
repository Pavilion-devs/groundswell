/**
 * Every model id Groundswell uses, in one place so they are easy to swap.
 * See plan.md §4 for which pipeline stage uses which model and why.
 */
export const MODELS = {
  /** Drafting the first codebook from a sample: the quality-critical step. */
  codebook: "claude-opus-5-5",
  /** Codebook revisions from corrections, and Insight Briefs. */
  reasoning: "claude-sonnet-5-5",
  /** High-volume work: classification, re-sorts, duplicate detection. */
  fast: "claude-haiku-5-5",
} as const;

export type ModelRole = keyof typeof MODELS;

/**
 * The app's chat agent and its sorter sub-agents run on Meta's Muse Spark
 * through the Meta Model API (see server/lib/meta-engine.ts and
 * agent-native.config.ts). The Claude ids above stay as the documented
 * alternative; switch `agent.engine` back to "anthropic" to use them.
 */
export const META_MODELS = {
  default: "muse-spark-1.3",
  others: ["muse-spark-1.1", "muse-wonder-1.0"],
} as const;
