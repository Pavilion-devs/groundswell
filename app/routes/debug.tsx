/**
 * Engine debug view (Phases 1–4). Deliberately plain: it exists to eyeball
 * what the actions return and to exercise the selection contract, not as
 * product UI. The real interface is designed with the user in Phase 5 (see
 * plan.md) and replaces this page.
 */
import { useActionQuery, writeClientAppState } from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { TAB_ID } from "@/lib/tab-id";

export function meta() {
  return [{ title: "Engine debug" }];
}

export default function DebugPage() {
  useSetPageTitle("Engine debug");
  const { data: boards } = useActionQuery("list-boards", {});
  const [params, setParams] = useSearchParams();
  const activeId = params.get("board") || boards?.boards[0]?.id || "";

  return (
    <div className="h-full overflow-auto p-6 font-mono text-sm">
      <p className="mb-4 text-xs text-muted-foreground">Engine debug view. Not product UI.</p>
      <label className="mb-4 block">
        Board{" "}
        <select
          className="border bg-background px-2 py-1"
          value={activeId}
          onChange={(e) => setParams({ board: e.target.value })}
        >
          {boards?.boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} ({b.noteCount} notes)
            </option>
          ))}
        </select>
      </label>
      {activeId ? <BoardDebug key={activeId} boardId={activeId} /> : <p>No boards yet. Create one with create-board.</p>}
    </div>
  );
}

function BoardDebug({ boardId }: { boardId: string }) {
  const { data: board } = useActionQuery("get-board", { id: boardId });
  const { data: codebook } = useActionQuery("get-codebook", { boardId });
  const [themeFilter, setThemeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: notes, isLoading } = useActionQuery("list-notes", {
    boardId,
    ...(search ? { search } : {}),
    ...(themeFilter === "__unsorted" ? { unsorted: true } : themeFilter ? { themeId: themeFilter } : {}),
    limit: 50,
    offset,
  });
  const themeName = useMemo(() => new Map(codebook?.themes.map((t) => [t.id, t.name]) ?? []), [codebook]);

  // Selection contract: the agent reads this through view-screen.
  useEffect(() => {
    void writeClientAppState(
      `selection:${TAB_ID}`,
      { boardId, noteIds: [...selected], themeIds: themeFilter && themeFilter !== "__unsorted" ? [themeFilter] : [] },
      { requestSource: TAB_ID },
    );
  }, [boardId, selected, themeFilter]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      {board && (
        <section>
          <h2 className="font-bold">{board.title}</h2>
          <p>
            notes {board.counts.notes} · sorted {board.counts.sorted} · unsorted {board.counts.unsorted} · sources{" "}
            {board.counts.sources}
          </p>
          <ul className="mt-2 list-disc pl-6">
            {board.sources.map((s) => (
              <li key={s.id}>
                [{s.kind}] {s.label} · synced {s.lastSyncedAt ?? "never"} · {JSON.stringify(s.stats)}
              </li>
            ))}
          </ul>
          <h3 className="mt-3 font-bold">Recent runs</h3>
          <ul className="list-disc pl-6">
            {board.recentRuns.map((r) => (
              <li key={r.id}>
                {r.kind} · {r.status} · {r.progress}/{r.total ?? "?"} {r.error ? `· ${r.error}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="font-bold">
          Codebook {codebook?.codebook ? `v${codebook.codebook.version} (${codebook.codebook.createdBy})` : "none"}
        </h3>
        {codebook?.codebook?.summary && <p className="text-xs text-muted-foreground">{codebook.codebook.summary}</p>}
        {codebook && (
          <p>
            sorted {codebook.counts.sorted} · unsorted (low confidence) {codebook.counts.unsortedLowConfidence} · not yet
            sorted {codebook.counts.notYetSorted}
          </p>
        )}
        <ul className="mt-2 space-y-1">
          {codebook?.themes.map((t) => (
            <li key={t.id}>
              <button className="underline" onClick={() => setThemeFilter(themeFilter === t.id ? "" : t.id)}>
                {themeFilter === t.id ? "▶ " : ""}
                {t.name}
              </button>{" "}
              ({t.noteCount}, {t.pinnedCount} pinned) [{t.key}] [{t.color}]
              <div className="pl-4 text-xs text-muted-foreground">{t.definition}</div>
            </li>
          ))}
          {codebook?.themes.length ? (
            <li>
              <button className="underline" onClick={() => setThemeFilter(themeFilter === "__unsorted" ? "" : "__unsorted")}>
                {themeFilter === "__unsorted" ? "▶ " : ""}Unsorted
              </button>
            </li>
          ) : null}
        </ul>
      </section>

      <section>
        <input
          className="mb-2 w-80 border bg-background px-2 py-1"
          placeholder="search notes"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
        <p className="mb-2">
          {isLoading ? "loading…" : `${notes?.total ?? 0} notes`} · selected {selected.size}{" "}
          <button className="underline" onClick={() => setSelected(new Set())}>
            clear
          </button>{" "}
          · showing {offset + 1}–{Math.min(offset + 50, notes?.total ?? 0)}{" "}
          <button className="underline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>
            prev
          </button>{" "}
          <button className="underline" disabled={offset + 50 >= (notes?.total ?? 0)} onClick={() => setOffset(offset + 50)}>
            next
          </button>
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left">
              <th className="border-b p-1">sel</th>
              <th className="border-b p-1">💬</th>
              <th className="border-b p-1">title / excerpt / quote</th>
              <th className="border-b p-1">theme</th>
              <th className="border-b p-1">conf</th>
            </tr>
          </thead>
          <tbody>
            {notes?.notes.map((n) => (
              <tr key={n.id} className="align-top">
                <td className="border-b p-1">
                  <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggle(n.id)} />
                </td>
                <td className="border-b p-1">{n.comments}</td>
                <td className="border-b p-1">
                  {n.url ? (
                    <a className="font-bold underline" href={n.url} target="_blank" rel="noreferrer">
                      {n.title ?? "(untitled)"}
                    </a>
                  ) : (
                    <span className="font-bold">{n.title ?? "(untitled)"}</span>
                  )}
                  <div className="whitespace-pre-wrap text-xs text-muted-foreground">{n.excerpt}</div>
                  {n.quote && <div className="mt-1 text-xs">❝ {n.quote} ❞</div>}
                </td>
                <td className="border-b p-1">
                  {n.themeId ? themeName.get(n.themeId) ?? n.themeId : "unsorted"}
                  {n.pinned ? " 📌" : ""}
                  {!n.themeId && n.suggestedThemeId ? ` (maybe ${themeName.get(n.suggestedThemeId) ?? "?"})` : ""}
                </td>
                <td className="border-b p-1">{n.confidence?.toFixed(2) ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
