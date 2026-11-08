/**
 * Engine debug view (Phases 1–4). Deliberately plain: it exists to eyeball
 * what the actions return and to exercise the selection contract, not as
 * product UI. The real interface is designed with the user in Phase 5 (see
 * plan.md) and replaces this page.
 */
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionMutation, useActionQuery, writeClientAppState } from "@agent-native/core/client/hooks";
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
  const [moveTo, setMoveTo] = useState<string>("");
  const [moveReason, setMoveReason] = useState("");
  const [moveResult, setMoveResult] = useState("");
  // Stand-in for dragging: the same action the board UI will call on drop.
  const move = useActionMutation("move-notes", {
    onSuccess: (r) => {
      setMoveResult(r.message);
      setSelected(new Set());
      setMoveReason("");
    },
    onError: (e) => setMoveResult(String((e as Error).message ?? e)),
  });

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

      <TeachPanel boardId={boardId} />

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
        <p className="mb-2">
          move selected to{" "}
          <select className="border bg-background px-2 py-1" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">(pick a theme)</option>
            <option value="__unsorted">Unsorted</option>
            {codebook?.themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>{" "}
          <input
            className="w-64 border bg-background px-2 py-1"
            placeholder="why (optional)"
            value={moveReason}
            onChange={(e) => setMoveReason(e.target.value)}
          />{" "}
          <button
            className="underline disabled:opacity-40"
            disabled={!moveTo || selected.size === 0 || move.isPending}
            onClick={() =>
              move.mutate({
                boardId,
                noteIds: [...selected],
                to: moveTo === "__unsorted" ? null : moveTo,
                ...(moveReason.trim() ? { reason: moveReason.trim() } : {}),
              })
            }
          >
            {move.isPending ? "moving…" : "move"}
          </button>{" "}
          <span className="text-xs text-muted-foreground">{moveResult}</span>
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

/**
 * Teach-by-dragging loop, plainly: pending corrections, the open proposal as a
 * before/after diff, and apply / reject / undo. Approving applies the revision
 * here (a deterministic write) and hands the re-sort to the agent, which runs
 * the sorters; the agent never applies a revision on its own.
 */
function TeachPanel({ boardId }: { boardId: string }) {
  const { data: corrections } = useActionQuery("list-corrections", { boardId, pendingOnly: true, limit: 20 });
  const { data: revision } = useActionQuery("get-codebook-revision", { boardId });
  const [status, setStatus] = useState("");
  const apply = useActionMutation("apply-codebook-revision", {
    onSuccess: (r) => {
      setStatus(r.message);
      if (r.runId) {
        sendToAgentChat({
          message: `I approved and applied codebook v${r.version}. Run the re-sort (run ${r.runId}) and tell me which notes moved.`,
          context: JSON.stringify({ boardId, runId: r.runId, codebookId: r.codebookId }),
          submit: true,
          openSidebar: true,
        });
      }
    },
    onError: (e) => setStatus(String((e as Error).message ?? e)),
  });
  const reject = useActionMutation("reject-codebook-revision", {
    onSuccess: (r) => setStatus(r.message),
    onError: (e) => setStatus(String((e as Error).message ?? e)),
  });
  const undo = useActionMutation("undo-codebook-revision", {
    onSuccess: (r) => setStatus(r.message),
    onError: (e) => setStatus(String((e as Error).message ?? e)),
  });
  const proposal = revision?.proposal?.status === "proposed" ? revision.proposal : null;

  return (
    <section className="border-t pt-4">
      <h3 className="font-bold">Teach by dragging</h3>
      <p>
        pending corrections {corrections?.pending ?? 0}
        {corrections?.revisionSuggested ? " · enough to learn from " : " "}
        <button
          className="underline disabled:opacity-40"
          disabled={!corrections?.pending}
          onClick={() =>
            sendToAgentChat({
              message: "Learn from the notes I moved on this board and propose a codebook revision.",
              context: JSON.stringify({ boardId }),
              submit: true,
              openSidebar: true,
            })
          }
        >
          ask the agent to learn
        </button>
        {revision?.undoable ? (
          <>
            {" "}
            ·{" "}
            <button className="underline" disabled={undo.isPending} onClick={() => undo.mutate({ boardId })}>
              undo revision v{revision.undoable.version}
            </button>
          </>
        ) : null}
      </p>
      <ul className="mt-1 list-disc pl-6 text-xs">
        {corrections?.corrections.map((c) => (
          <li key={c.id}>
            [{c.id}] {c.noteTitle}: {c.from?.name ?? "Unsorted"} → {c.to?.name ?? "Unsorted"}
            {c.reason ? ` · "${c.reason}"` : ""}
          </li>
        ))}
      </ul>
      {proposal && (
        <div className="mt-3 border p-2">
          <p className="font-bold">
            Proposal v{proposal.version} (from v{proposal.basedOnVersion}) · re-sorts {proposal.impact?.notesToReSort ?? "?"} notes
          </p>
          {proposal.summary && <p className="text-xs">{proposal.summary}</p>}
          <ul className="mt-2 space-y-2">
            {proposal.entries.map((e) => (
              <li key={`${e.op}-${e.key}`}>
                <span className="font-bold">
                  {e.op} {e.after?.name ?? e.before?.name}
                </span>{" "}
                <span className="text-xs text-muted-foreground">({e.basedOn.join(", ")})</span>
                <div className="text-xs">why: {e.why}</div>
                {e.before && <div className="pl-4 text-xs text-muted-foreground line-through">{e.before.definition}</div>}
                {e.after && <div className="pl-4 text-xs">{e.after.definition}</div>}
                {e.after && e.after.excludeRules.length > 0 && (
                  <div className="pl-4 text-xs">exclude: {e.after.excludeRules.join(" · ")}</div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <button
              className="underline"
              disabled={apply.isPending}
              onClick={() => apply.mutate({ boardId, codebookId: proposal.codebookId })}
            >
              approve and apply
            </button>{" "}
            ·{" "}
            <button
              className="underline"
              disabled={reject.isPending}
              onClick={() => reject.mutate({ boardId, codebookId: proposal.codebookId })}
            >
              reject
            </button>
          </p>
        </div>
      )}
      {status && <p className="mt-2 text-xs">{status}</p>}
    </section>
  );
}
