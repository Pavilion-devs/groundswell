import { describe, expect, it } from "vitest";

import { guessColumns, parseCsv, rowsToNotes } from "./csv.js";
import { parseRepo } from "./github.js";

describe("parseRepo", () => {
  it("accepts owner/name and github URLs", () => {
    expect(parseRepo("BuilderIO/agent-native")).toEqual({ owner: "BuilderIO", repo: "agent-native" });
    expect(parseRepo("https://github.com/BuilderIO/agent-native")).toEqual({ owner: "BuilderIO", repo: "agent-native" });
    expect(parseRepo("github.com/BuilderIO/agent-native/issues/12")).toEqual({ owner: "BuilderIO", repo: "agent-native" });
    expect(parseRepo(" BuilderIO/agent-native.git/ ")).toEqual({ owner: "BuilderIO", repo: "agent-native" });
  });

  it("rejects anything else", () => {
    for (const bad of ["", "agent-native", "a/b/c", "https://gitlab.com/a/b", "own er/repo", "../../etc/passwd"]) {
      expect(parseRepo(bad)).toBeNull();
    }
  });
});

describe("guessColumns", () => {
  it("matches common headers regardless of case, spaces and dashes", () => {
    expect(guessColumns(["Ticket ID", "Subject", "Customer", "Feedback", "Created", "Link"])).toEqual({
      id: "Ticket ID",
      title: "Subject",
      author: "Customer",
      body: "Feedback",
      date: "Created",
      url: "Link",
    });
  });

  it("never assigns one header to two fields", () => {
    const cols = guessColumns(["comment"]);
    expect(Object.values(cols)).toEqual(["comment"]);
  });
});

describe("rowsToNotes", () => {
  const csv = [
    "id,title,feedback,link,date,votes",
    '1,Slow export,"Exporting takes a minute, sometimes times out",https://example.com/1,2026-10-01,4',
    "2,Bad link,Please add dark mode,javascript:alert(1),not a date,-3",
    "3,,,,,",
    '1,Duplicate id,"same id again",,,',
  ].join("\n");

  it("maps rows, drops empty bodies and repeated ids, and sanitises links and dates", () => {
    const parsed = parseCsv(csv);
    const { notes, skipped } = rowsToNotes(parsed.rows, { id: "id", title: "title", body: "feedback", url: "link", date: "date", reactions: "votes" });
    expect(skipped).toBe(2);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({
      externalId: "1",
      title: "Slow export",
      body: "Exporting takes a minute, sometimes times out",
      url: "https://example.com/1",
      sourceCreatedAt: "2026-10-01T00:00:00.000Z",
      reactions: 4,
    });
    expect(notes[1]).toMatchObject({ externalId: "2", url: null, sourceCreatedAt: null, reactions: 0 });
  });

  it("derives a stable id from content when no id column is given", () => {
    const parsed = parseCsv("feedback\nhello there\nhello there\nsomething else");
    const a = rowsToNotes(parsed.rows, { body: "feedback" });
    const b = rowsToNotes(parsed.rows, { body: "feedback" });
    expect(a.notes.map((n) => n.externalId)).toEqual(b.notes.map((n) => n.externalId));
    expect(a.notes).toHaveLength(2);
    expect(a.skipped).toBe(1);
  });
});
