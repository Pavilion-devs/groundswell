/**
 * Insight Briefs: the agent writes the prose (problem, impact, next step);
 * the server owns the facts. Evidence is stored as spans into a note's text
 * and only after the quote is found verbatim; metrics are computed in SQL.
 */

export interface BriefEvidence {
  noteId: string;
  start: number;
  end: number;
  why: string | null;
}

export interface BriefBody {
  problem: string;
  impact: string;
  evidence: BriefEvidence[];
  nextStep: string;
}

export interface BriefMetrics {
  notes: number;
  uniqueProblems: number;
  reporters: number;
  engagement: number;
  recent: number;
  rank: number | null;
  score: number;
  firstReported: string | null;
  lastReported: string | null;
  duplicateGroups: number;
}

export interface RenderedEvidence {
  quote: string;
  why: string | null;
  title: string;
  url: string | null;
  author: string | null;
}

export function parseBriefBody(value: unknown): BriefBody | null {
  const b = value as Partial<BriefBody> | null;
  return b && typeof b.problem === "string" && Array.isArray(b.evidence) ? (b as BriefBody) : null;
}

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "unknown";
}

/** Markdown for a brief: what export copies and what file-github-issue posts. */
export function renderBriefMarkdown(input: {
  title: string;
  themeName: string;
  body: BriefBody;
  evidence: RenderedEvidence[];
  metrics: BriefMetrics;
  boardTitle: string;
}): string {
  const { title, themeName, body, evidence, metrics, boardTitle } = input;
  const facts = [
    `| Notes in the theme | ${metrics.notes} |`,
    ...(metrics.uniqueProblems !== metrics.notes ? [`| Distinct problems (duplicates collapsed) | ${metrics.uniqueProblems} |`] : []),
    `| Distinct reporters | ${metrics.reporters} |`,
    `| Engagement (comments + 2 × reactions) | ${metrics.engagement} |`,
    `| Reported between | ${day(metrics.firstReported)} and ${day(metrics.lastReported)} |`,
    ...(metrics.rank ? [`| Priority | #${metrics.rank} on the board (score ${metrics.score}/100) |`] : []),
  ];
  const quotes = evidence.map((e) => {
    // A profile link credits the reporter without an @mention, which would
    // notify every quoted person when the brief is filed in a public repo.
    const who = e.author ? ` by [${e.author}](https://github.com/${encodeURIComponent(e.author)})` : "";
    const source = e.url ? `[${e.title}](${e.url})` : e.title;
    // Same reason for @handles inside a quote: a zero-width space keeps the text
    // looking verbatim but stops GitHub from turning it into a mention.
    const quote = e.quote.replace(/\n+/g, " ").replace(/@(?=[A-Za-z0-9-])/g, "@\u200b");
    const lines = [`> ${quote}`, `>`, `> — ${source}${who}`];
    if (e.why) lines.push("", `_${e.why}_`);
    return lines.join("\n");
  });
  return [
    `## ${title}`,
    "",
    `**Theme:** ${themeName}`,
    "",
    "### Problem",
    body.problem,
    "",
    "### Impact",
    body.impact,
    "",
    "### Evidence",
    quotes.join("\n\n"),
    "",
    "### Facts",
    "| | |",
    "|---|---|",
    ...facts,
    "",
    "### Suggested next step",
    body.nextStep,
    "",
    "---",
    `_Synthesised by Groundswell from the "${boardTitle}" board. Quotes are verbatim; facts are counted from the linked reports._`,
  ].join("\n");
}
