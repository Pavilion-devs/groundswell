/**
 * Engine debug view (Phases 1–4). Deliberately plain: it exists to eyeball
 * what the actions return, not as product UI. The real interface is designed
 * with the user in Phase 5 (see plan.md) and replaces this page.
 */
import { useActionQuery } from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import { useState } from "react";

export function meta() {
  return [{ title: "Engine debug" }];
}

export default function DebugPage() {
  useSetPageTitle("Engine debug");
  const { data: boards } = useActionQuery("list-boards", {});
  const [boardId, setBoardId] = useState<string>("");
  const activeId = boardId || boards?.boards[0]?.id || "";

  return (
    <div className="h-full overflow-auto p-6 font-mono text-sm">
      <p className="mb-4 text-xs text-muted-foreground">Engine debug view. Not product UI.</p>
      <label className="mb-4 block">
        Board{" "}
        <select className="border bg-background px-2 py-1" value={activeId} onChange={(e) => setBoardId(e.target.value)}>
          {boards?.boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} ({b.noteCount} notes)
            </option>
          ))}
        </select>
      </label>
      {activeId ? <BoardDebug boardId={activeId} /> : <p>No boards yet. Create one with create-board.</p>}
    </div>
  );
}

function BoardDebug({ boardId }: { boardId: string }) {
  const { data: board } = useActionQuery("get-board", { id: boardId });
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const { data: notes, isLoading } = useActionQuery("list-notes", {
    boardId,
    ...(search ? { search } : {}),
    limit: 50,
    offset,
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
          {isLoading ? "loading…" : `${notes?.total ?? 0} notes`} · showing {offset + 1}–
          {Math.min(offset + 50, notes?.total ?? 0)}{" "}
          <button className="underline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>
            prev
          </button>{" "}
          <button
            className="underline"
            disabled={offset + 50 >= (notes?.total ?? 0)}
            onClick={() => setOffset(offset + 50)}
          >
            next
          </button>
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left">
              <th className="border-b p-1">👍</th>
              <th className="border-b p-1">💬</th>
              <th className="border-b p-1">title / excerpt</th>
              <th className="border-b p-1">author</th>
              <th className="border-b p-1">state</th>
              <th className="border-b p-1">theme</th>
            </tr>
          </thead>
          <tbody>
            {notes?.notes.map((n) => (
              <tr key={n.id} className="align-top">
                <td className="border-b p-1">{n.reactions}</td>
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
                </td>
                <td className="border-b p-1">{n.author}</td>
                <td className="border-b p-1">{n.state}</td>
                <td className="border-b p-1">{n.themeId ?? "unsorted"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
