import { describe, expect, it } from "vitest";

import { colorPicker, colorSlot, themeKey, uniqueKey } from "./codebook.js";
import { findQuote, noteText, quoteOf } from "./quotes.js";
import { stratifiedSample } from "./sampling.js";

describe("findQuote", () => {
  const text = "Export to CSV takes forever on big reports.\n\nIt said “invalid_client” and then   stopped.";

  it("finds exact quotes", () => {
    const span = findQuote(text, "takes forever on big reports");
    expect(span && text.slice(span.start, span.end)).toBe("takes forever on big reports");
  });

  it("tolerates whitespace and curly-quote differences, mapping back to the original text", () => {
    const span = findQuote(text, 'Export to  CSV takes\nforever');
    expect(span && text.slice(span.start, span.end)).toBe("Export to CSV takes forever");
    const curly = findQuote(text, 'It said "invalid_client" and then stopped');
    expect(curly && text.slice(curly.start, curly.end)).toBe("It said “invalid_client” and then   stopped");
  });

  it("strips wrapping quote marks the model adds", () => {
    const span = findQuote(text, "“takes forever”");
    expect(span && text.slice(span.start, span.end)).toBe("takes forever");
  });

  it("rejects paraphrases, invented words and trivial fragments", () => {
    expect(findQuote(text, "exports take forever on big reports")).toBeNull();
    expect(findQuote(text, "Export to CSV takes forever on huge reports")).toBeNull();
    expect(findQuote(text, "on")).toBeNull();
    expect(findQuote(text, "x".repeat(401))).toBeNull();
  });

  it("indexes into title + body", () => {
    const t = noteText({ title: "Dark mode", body: "Please add it" });
    expect(t).toBe("Dark mode\n\nPlease add it");
    const span = findQuote(t, "Please add it");
    expect(span && quoteOf(t, span.start, span.end)).toBe("Please add it");
    expect(quoteOf(t, null, null)).toBeNull();
    expect(quoteOf(t, 5, 999)).toBeNull();
  });
});

describe("theme keys", () => {
  it("slugifies names", () => {
    expect(themeKey("Self-hosted sign-in breaks")).toBe("self-hosted-sign-in-breaks");
    expect(themeKey("Install & setup errors!")).toBe("install-setup-errors");
    expect(themeKey("???")).toBe("theme");
  });
  it("de-duplicates keys", () => {
    expect(uniqueKey("auth", new Set(["auth", "auth-2"]))).toBe("auth-3");
    expect(uniqueKey("billing", new Set(["auth"]))).toBe("billing");
  });
  it("cycles colour slots", () => {
    expect(colorSlot(0)).toBe("slot-1");
    expect(colorSlot(12)).toBe("slot-1");
  });
  it("hands out colours for more themes than slots without looping forever", () => {
    const next = colorPicker([]);
    const colours = Array.from({ length: 30 }, () => next());
    expect(new Set(colours.slice(0, 12)).size).toBe(12);
    expect(colours[12]).toBe("slot-1");
  });
  it("prefers slots not already used", () => {
    const next = colorPicker(["slot-1", "slot-2", null]);
    expect(next()).toBe("slot-3");
  });
});

describe("stratifiedSample", () => {
  const rows = Array.from({ length: 300 }, (_, i) => ({
    id: `n${String(i).padStart(3, "0")}`,
    reactions: i % 50 === 0 ? 10 : 0,
    comments: i % 7,
    sourceCreatedAt: new Date(2026, 0, 1 + i).toISOString(),
    createdAt: "2026-11-07T00:00:00.000Z",
  }));

  it("returns the requested size with no duplicates, deterministically", () => {
    const a = stratifiedSample(rows, 100);
    expect(a).toHaveLength(100);
    expect(new Set(a.map((r) => r.id)).size).toBe(100);
    expect(stratifiedSample(rows, 100).map((r) => r.id)).toEqual(a.map((r) => r.id));
  });

  it("includes the most engaged notes and spans the whole time range", () => {
    const ids = new Set(stratifiedSample(rows, 100).map((r) => r.id));
    for (const loud of ["n000", "n050", "n100", "n150", "n200", "n250"]) expect(ids.has(loud)).toBe(true);
    const dates = stratifiedSample(rows, 100).map((r) => r.sourceCreatedAt).sort();
    expect(dates[0]! < new Date(2026, 1, 1).toISOString()).toBe(true);
    expect(dates[dates.length - 1]! > new Date(2026, 8, 1).toISOString()).toBe(true);
  });

  it("returns everything when the board is smaller than the sample", () => {
    expect(stratifiedSample(rows.slice(0, 10), 100)).toHaveLength(10);
  });
});
