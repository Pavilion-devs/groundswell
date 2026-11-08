import { describe, expect, it } from "vitest";

import { type Change, type ParentTheme, planRestore, planRevision, type SnapshotRow } from "./revisions.js";

const theme = (key: string, name: string, extra: Partial<ParentTheme> = {}): ParentTheme => ({
  key,
  name,
  definition: `Notes about ${name.toLowerCase()} problems.`,
  includeRules: [],
  excludeRules: [],
  color: "slot-1",
  x: null,
  y: null,
  ...extra,
});

const parent = [theme("auth", "Sign-in fails"), theme("docs", "Docs 404s"), theme("deploy", "Deploys crash")];
const pending = new Set(["cor_1", "cor_2", "cor_3"]);
const why = "The user moved three self-hosted sign-in notes out of Docs.";

describe("planRevision", () => {
  it("sharpens a theme and keeps its key, colour and position on rename", () => {
    const changes: Change[] = [
      { op: "update", themeKey: "auth", name: "Self-hosted sign-in fails", excludeRules: ["Docs pages that 404 go to Docs 404s"], why, basedOn: ["cor_1"] },
    ];
    const plan = planRevision(parent, changes, pending);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const auth = plan.themes.find((t) => t.key === "auth");
    expect(auth?.name).toBe("Self-hosted sign-in fails");
    expect(auth?.color).toBe("slot-1");
    expect(auth?.origin).toBe("updated");
    expect(plan.diff[0]?.before?.name).toBe("Sign-in fails");
    expect(plan.diff[0]?.after?.excludeRules).toEqual(["Docs pages that 404 go to Docs 404s"]);
    expect(plan.themes).toHaveLength(3);
  });

  it("gives an added theme a key no parent theme used, even after a removal", () => {
    const changes: Change[] = [
      { op: "remove", themeKey: "docs", why, basedOn: ["cor_1"] },
      { op: "add", name: "Docs", definition: "Documentation pages that are missing or wrong.", why, basedOn: ["cor_2"] },
    ];
    const plan = planRevision(parent, changes, pending);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const added = plan.themes.find((t) => t.origin === "added");
    expect(added?.key).toBe("docs-2");
    expect(plan.themes.some((t) => t.key === "docs")).toBe(false);
  });

  it("rejects changes that cite corrections that are not pending", () => {
    const plan = planRevision(parent, [{ op: "remove", themeKey: "docs", why, basedOn: ["cor_9"] }], pending);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.errors.join(" ")).toContain("cor_9");
  });

  it("rejects unknown keys, two changes to one theme, no-op updates and duplicate names", () => {
    const changes: Change[] = [
      { op: "update", themeKey: "nope", definition: "Something new entirely here.", why, basedOn: ["cor_1"] },
      { op: "update", themeKey: "auth", definition: "Sign-in breaks on self-hosted installs.", why, basedOn: ["cor_1"] },
      { op: "remove", themeKey: "auth", why, basedOn: ["cor_1"] },
      { op: "update", themeKey: "deploy", name: "Deploys crash", why, basedOn: ["cor_2"] },
      { op: "add", name: "docs 404s", definition: "Another docs theme with the same name.", why, basedOn: ["cor_3"] },
    ];
    const plan = planRevision(parent, changes, pending);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    const text = plan.errors.join(" ");
    expect(text).toContain('"nope"');
    expect(text).toContain("already has a change");
    expect(text).toContain("would not change");
    expect(text).toContain("share a name");
  });

  it("refuses to leave fewer than two themes", () => {
    const changes: Change[] = [
      { op: "remove", themeKey: "auth", why, basedOn: ["cor_1"] },
      { op: "remove", themeKey: "docs", why, basedOn: ["cor_2"] },
    ];
    const plan = planRevision(parent, changes, pending);
    expect(plan.ok).toBe(false);
  });
});

describe("planRestore", () => {
  const row = (noteId: string, themeKey: string | null, extra: Partial<SnapshotRow> = {}): SnapshotRow => ({
    noteId,
    themeKey,
    suggestedKey: null,
    confidence: 0.9,
    rationale: null,
    quoteStart: null,
    quoteEnd: null,
    pinned: false,
    placedBy: "agent",
    lastRunId: "run_old",
    updatedAt: "2026-11-08T10:00:00.000Z",
    ...extra,
  });
  const appliedAt = "2026-11-08T12:00:00.000Z";

  it("restores every snapshot row and drops placements the re-sort created", () => {
    const plan = planRestore(
      [row("n1", "auth"), row("n2", null)],
      [
        { noteId: "n1", placedBy: "agent", pinned: false, updatedAt: "2026-11-08T12:01:00.000Z" },
        { noteId: "n2", placedBy: "agent", pinned: false, updatedAt: "2026-11-08T12:01:00.000Z" },
        { noteId: "n3", placedBy: "agent", pinned: false, updatedAt: "2026-11-08T12:01:00.000Z" },
      ],
      appliedAt,
    );
    expect(plan.restore.map((r) => r.noteId)).toEqual(["n1", "n2"]);
    expect(plan.remove).toEqual(["n3"]);
    expect(plan.keptUserEdits).toEqual([]);
  });

  it("keeps a note the user moved after the revision was applied", () => {
    const plan = planRestore(
      [row("n1", "auth")],
      [
        { noteId: "n1", placedBy: "user", pinned: true, updatedAt: "2026-11-08T12:05:00.000Z" },
        { noteId: "n4", placedBy: "user", pinned: true, updatedAt: "2026-11-08T12:06:00.000Z" },
      ],
      appliedAt,
    );
    expect(plan.restore).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.keptUserEdits.sort()).toEqual(["n1", "n4"]);
  });

  it("still restores a user pin made before the revision", () => {
    const plan = planRestore(
      [row("n1", "docs", { pinned: true, placedBy: "user" })],
      [{ noteId: "n1", placedBy: "user", pinned: true, updatedAt: "2026-11-08T09:00:00.000Z" }],
      appliedAt,
    );
    expect(plan.restore).toHaveLength(1);
    expect(plan.restore[0]?.pinned).toBe(true);
  });
});
