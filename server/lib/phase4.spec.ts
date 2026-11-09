import { describe, expect, it } from "vitest";

import { renderBriefMarkdown } from "./briefs.js";
import { validateGroups } from "./duplicates.js";
import { issueFromWebhook } from "./github.js";
import { DEFAULT_WEIGHTS, parseWeights, rankThemes, type ThemeStats } from "./priorities.js";

const stats = (name: string, v: Partial<ThemeStats> = {}): ThemeStats => ({
  themeId: `thm_${name}`,
  key: name,
  name,
  internal: false,
  notes: 10,
  uniqueProblems: 10,
  reporters: 5,
  engagement: 20,
  recent: 2,
  ...v,
});

describe("rankThemes", () => {
  it("ranks feedback themes by weighted, normalised metrics and explains each score", () => {
    const ranked = rankThemes(
      [stats("docs", { uniqueProblems: 30, reporters: 25, engagement: 40, recent: 10 }), stats("auth", { uniqueProblems: 10, reporters: 5 })],
      DEFAULT_WEIGHTS,
    );
    expect(ranked[0]?.name).toBe("docs");
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[0]?.score).toBe(100);
    const auth = ranked[1]!;
    const sum = Object.values(auth.breakdown).reduce((s, b) => s + b.contribution, 0);
    expect(Math.abs(sum - auth.score)).toBeLessThan(0.2);
    expect(auth.breakdown.volume.normalized).toBeCloseTo(1 / 3, 2);
  });

  it("never ranks internal themes, even when they are the biggest", () => {
    const ranked = rankThemes([stats("ci", { internal: true, uniqueProblems: 70, reporters: 3 }), stats("auth")], DEFAULT_WEIGHTS);
    expect(ranked[0]?.name).toBe("auth");
    expect(ranked[0]?.rank).toBe(1);
    const ci = ranked.find((r) => r.name === "ci");
    expect(ci?.rank).toBeNull();
    // Normalised against feedback themes only, capped at 1.
    expect(ci?.breakdown.volume.normalized).toBe(1);
  });

  it("uses distinct problems, not raw notes, for volume", () => {
    const ranked = rankThemes(
      [stats("dupey", { notes: 40, uniqueProblems: 8, reporters: 5 }), stats("broad", { notes: 20, uniqueProblems: 20, reporters: 5 })],
      { volume: 1, reporters: 0, engagement: 0, recency: 0 },
    );
    expect(ranked[0]?.name).toBe("broad");
  });

  it("falls back to defaults for missing or invalid weights", () => {
    expect(parseWeights(null)).toEqual(DEFAULT_WEIGHTS);
    expect(parseWeights({ volume: 3, recency: "x" })).toEqual({ ...DEFAULT_WEIGHTS, volume: 3 });
  });
});

describe("validateGroups", () => {
  const theme = new Set(["n1", "n2", "n3", "n4"]);

  it("adds the canonical note to its members", () => {
    const r = validateGroups([{ canonicalNoteId: "n1", memberNoteIds: ["n2"], summary: "Docs 404" }], theme);
    expect(r.ok && r.groups[0]?.memberNoteIds).toEqual(["n1", "n2"]);
  });

  it("rejects notes outside the theme, singletons and notes in two groups", () => {
    const r = validateGroups(
      [
        { canonicalNoteId: "n1", memberNoteIds: ["n9"], summary: "x" },
        { canonicalNoteId: "n2", memberNoteIds: [], summary: "y" },
        { canonicalNoteId: "n3", memberNoteIds: ["n1"], summary: "z" },
      ],
      theme,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const text = r.errors.join(" ");
    expect(text).toContain("n9");
    expect(text).toContain("at least two");
    expect(text).toContain("already in group 1");
  });
});

describe("issueFromWebhook", () => {
  const payload = {
    action: "opened",
    issue: {
      number: 7001,
      title: "Docs page 404s",
      body: "The getting started page is gone.",
      html_url: "https://github.com/BuilderIO/agent-native/issues/7001",
      user: { login: "someone", type: "User", avatar_url: "https://a" },
      comments: 2,
      reactions: { total_count: 3 },
      labels: [{ name: "docs" }],
      state: "open",
      created_at: "2026-11-08T10:00:00Z",
    },
    repository: { full_name: "BuilderIO/agent-native" },
  };

  it("maps an issue exactly like an import", () => {
    const r = issueFromWebhook(payload);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.repo).toEqual({ owner: "BuilderIO", repo: "agent-native" });
    expect(r.note).toMatchObject({ externalId: "7001", author: "someone", reactions: 3, comments: 2, labels: ["docs"], state: "open" });
  });

  it("skips pull requests, bots and deletions", () => {
    expect(issueFromWebhook({ ...payload, issue: { ...payload.issue, pull_request: {} } }).ok).toBe(false);
    expect(issueFromWebhook({ ...payload, issue: { ...payload.issue, user: { login: "ci[bot]", type: "Bot" } } }).ok).toBe(false);
    expect(issueFromWebhook({ ...payload, action: "deleted" }).ok).toBe(false);
    expect(issueFromWebhook({ hello: "world" }).ok).toBe(false);
  });
});

describe("renderBriefMarkdown", () => {
  it("renders verbatim quotes with links and SQL facts", () => {
    const md = renderBriefMarkdown({
      title: "Docs pages 404",
      themeName: "Docs 404s",
      boardTitle: "Feedback",
      body: { problem: "Pages are gone.", impact: "New users bounce.", evidence: [], nextStep: "Add redirects." },
      evidence: [{ quote: "the site 404s on a ton of docs/ pages.", why: null, title: "Heads up", url: "https://x/1", author: "ann" }],
      metrics: {
        notes: 30,
        uniqueProblems: 12,
        reporters: 25,
        engagement: 40,
        recent: 3,
        rank: 1,
        score: 92.5,
        firstReported: "2026-01-02T00:00:00Z",
        lastReported: "2026-11-01T00:00:00Z",
        duplicateGroups: 4,
      },
    });
    expect(md).toContain("## Docs pages 404");
    expect(md).toContain("> the site 404s on a ton of docs/ pages.");
    expect(md).toContain("[Heads up](https://x/1) by [ann](https://github.com/ann)");
    expect(md).not.toContain("@ann");
    expect(md).toContain("| Distinct problems (duplicates collapsed) | 12 |");
    expect(md).toContain("#1 on the board (score 92.5/100)");
  });

  it("stops @handles inside quotes from becoming mentions", () => {
    const md = renderBriefMarkdown({
      title: "T",
      themeName: "X",
      boardTitle: "B",
      body: { problem: "p", impact: "i", evidence: [], nextStep: "n" },
      evidence: [{ quote: "cc @renan please look", why: null, title: "t", url: null, author: null }],
      metrics: { notes: 1, uniqueProblems: 1, reporters: 1, engagement: 0, recent: 0, rank: null, score: 0, firstReported: null, lastReported: null, duplicateGroups: 0 },
    });
    expect(md).toContain("cc @\u200brenan please look");
  });
});
