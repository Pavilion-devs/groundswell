/**
 * The Groundswell board. Ported from Twisky's TaskBoard and the board frame in
 * its HeroSection: same header, columns and native drag and drop. Columns are
 * problems ranked by priority (SQL), then Unsorted, then groups that are not
 * feedback. Dropping a report calls move-notes, which pins it and records a
 * correction the agent learns from; agent and webhook changes arrive live.
 */
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionMutation, useActionQuery, writeClientAppState } from "@agent-native/core/client/hooks";
import { Loader2, Plus, Sparkles, Undo2 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { TAB_ID } from "@/lib/tab-id";

import { BoardColumn, type Column } from "./BoardColumn";
import { ProblemDrawer } from "./ProblemDrawer";
import { ReportDrawer } from "./ReportDrawer";
import { RevisionSheet } from "./RevisionSheet";
import type { Report } from "./ReportCard";

const UNSORTED = "unsorted";

interface BoardProps {
  boardId: string;
  search: string;
  onCounts?: (counts: { notes: number; problems: number; unsorted: number }) => void;
}

export function Board({ boardId, search, onCounts }: BoardProps) {
  const priorities = useActionQuery("get-priorities", { boardId });
  const notes = useActionQuery("list-notes", { boardId, limit: 1000 });
  const corrections = useActionQuery("list-corrections", { boardId, limit: 1 });
  const revision = useActionQuery("get-codebook-revision", { boardId });
  const board = useActionQuery("get-board", { id: boardId });
  // Moves show at once; the server's answer replaces them when it arrives.
  const [overrides, setOverrides] = useState<Map<string, string | null>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragged, setDragged] = useState<Report | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [openProblem, setOpenProblem] = useState<string | null>(null);
  const [teachOpen, setTeachOpen] = useState(false);
  const [rippled, setRippled] = useState<Set<string>>(new Set());

  const undo = useActionMutation("undo-codebook-revision", {
    onSuccess: (r) => toast(`Back to v${r.restoredVersion}`, { description: r.message }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not undo the revision."),
  });

  // Ripple: when a re-sort after a revision finishes, flash the cards the
  // agent moved on its own, once per run.
  const resort = board.data?.recentRuns.find((r) => r.kind === "resort") ?? null;
  const movedCount = resort?.movedNoteIds?.length ?? 0;
  const cardsReady = !!notes.data && !!priorities.data;
  useEffect(() => {
    if (!cardsReady || !resort || resort.status !== "succeeded" || !resort.movedNoteIds?.length || !resort.finishedAt) return;
    if (Date.now() - Date.parse(resort.finishedAt) > 15 * 60_000) return;
    const key = `gs.rippled.${resort.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked: ripple anyway.
    }
    setRippled(new Set(resort.movedNoteIds));
    const first = resort.movedNoteIds[0];
    requestAnimationFrame(() =>
      document.querySelector(`[data-note-id="${CSS.escape(first ?? "")}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }),
    );
    toast(`The agent moved ${movedCount} report${movedCount === 1 ? "" : "s"}`, { description: "They are flashing on the board. Undo puts every card back exactly." });
  }, [cardsReady, resort?.id, resort?.status, movedCount]); // eslint-disable-line react-hooks/exhaustive-deps
  // Clear the flash after it has played (separate so a re-run cannot leave it on).
  useEffect(() => {
    if (!rippled.size) return;
    const t = setTimeout(() => setRippled(new Set()), 4000);
    return () => clearTimeout(t);
  }, [rippled]);

  const move = useActionMutation("move-notes", {
    onError: (error, input) => {
      setOverrides((prev) => {
        const next = new Map(prev);
        for (const id of input.noteIds) next.delete(id);
        return next;
      });
      toast.error(error instanceof Error ? error.message : "The move did not save.");
    },
  });

  const themes = priorities.data?.themes ?? [];
  const nameOf = useMemo(() => new Map(themes.map((t) => [t.themeId, t.name])), [themes]);

  const reports: Report[] = useMemo(
    () =>
      (notes.data?.notes ?? []).map((n) => ({
        id: n.id,
        title: n.title ?? "(untitled)",
        quote: n.quote,
        excerpt: n.excerpt,
        author: n.author,
        url: n.url,
        labels: Array.isArray(n.labels) ? n.labels : [],
        comments: n.comments,
        reactions: n.reactions,
        createdAt: n.sourceCreatedAt,
        pinned: n.pinned,
        confidence: n.confidence,
        themeId: overrides.has(n.id) ? (overrides.get(n.id) ?? null) : n.themeId,
        suggestion: !n.themeId && n.suggestedThemeId ? (nameOf.get(n.suggestedThemeId) ?? null) : null,
      })),
    [notes.data, overrides, nameOf],
  );

  // Drop an override once the server agrees, so live updates take over again.
  useEffect(() => {
    if (!overrides.size || !notes.data) return;
    const server = new Map(notes.data.notes.map((n) => [n.id, n.themeId]));
    const stale = [...overrides].filter(([id, themeId]) => server.get(id) === themeId);
    if (stale.length) {
      setOverrides((prev) => {
        const next = new Map(prev);
        for (const [id] of stale) next.delete(id);
        return next;
      });
    }
  }, [notes.data, overrides]);

  const q = search.trim().toLowerCase();
  const visible = q
    ? reports.filter((r) => [r.title, r.quote ?? "", r.excerpt, r.author ?? ""].some((s) => s.toLowerCase().includes(q)))
    : reports;

  const columns: Column[] = useMemo(() => {
    const byTheme = new Map<string, Report[]>();
    for (const r of visible) {
      const key = r.themeId ?? UNSORTED;
      byTheme.set(key, [...(byTheme.get(key) ?? []), r]);
    }
    const problem = themes
      .filter((t) => !t.internal)
      .map((t) => ({ id: t.themeId, title: t.name, kind: "problem" as const, rank: t.rank, score: t.score, reports: byTheme.get(t.themeId) ?? [] }));
    const internal = themes
      .filter((t) => t.internal)
      .map((t) => ({ id: t.themeId, title: t.name, kind: "internal" as const, rank: null, score: null, reports: byTheme.get(t.themeId) ?? [] }));
    const unsorted = { id: UNSORTED, title: "Unsorted", kind: "unsorted" as const, rank: null, score: null, reports: byTheme.get(UNSORTED) ?? [] };
    return [...problem, unsorted, ...internal];
  }, [visible, themes]);

  const unsortedCount = reports.filter((r) => !r.themeId).length;
  const problemCount = themes.filter((t) => !t.internal).length;
  useEffect(() => {
    onCounts?.({ notes: reports.length, problems: problemCount, unsorted: unsortedCount });
  }, [onCounts, reports.length, problemCount, unsortedCount]);

  // Selection contract: the agent reads this through view-screen ("these").
  useEffect(() => {
    void writeClientAppState(`selection:${TAB_ID}`, { boardId, noteIds: [...selected], themeIds: [] }, { requestSource: TAB_ID });
  }, [boardId, selected]);

  // A plain click opens the report (and selects just it); cmd/shift-click builds a selection.
  const onSelect = (id: string, additive: boolean) => {
    if (!additive) {
      setSelected(new Set([id]));
      setOpenNote(id);
      return;
    }
    setSelected((prev) => {
      const next = new Set(additive ? prev : []);
      if (prev.has(id) && (additive || prev.size === 1)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    const noteId = e.dataTransfer.getData("noteId");
    const report = reports.find((r) => r.id === noteId);
    if (!report) return;
    const from = report.themeId ?? UNSORTED;
    if (from === targetColumnId) return;
    // Dragging one of several selected cards moves the whole selection.
    const ids = selected.has(noteId) ? [...selected] : [noteId];
    const to = targetColumnId === UNSORTED ? null : targetColumnId;
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.set(id, to);
      return next;
    });
    const targetTitle = columns.find((c) => c.id === targetColumnId)?.title ?? "Unsorted";
    move.mutate(
      { boardId, noteIds: ids, to },
      {
        onSuccess: (result) => {
          const what = ids.length === 1 ? `“${report.title}”` : `${ids.length} reports`;
          toast(`${what} moved to ${targetTitle}`, {
            description: result.corrections
              ? `Pinned, and the agent will learn from it. ${result.pendingCorrections} correction${result.pendingCorrections === 1 ? "" : "s"} waiting.`
              : "Pinned so the agent will not move it back.",
            ...(result.revisionSuggested
              ? {
                  action: {
                    label: "Teach the agent",
                    onClick: () =>
                      sendToAgentChat({
                        message: "Learn from the notes I moved on this board and propose a codebook revision.",
                        context: JSON.stringify({ boardId }),
                        submit: true,
                        openSidebar: true,
                      }),
                  },
                }
              : {}),
          });
        },
      },
    );
  };

  const pending = corrections.data?.pending ?? 0;
  const proposalOpen = revision.data?.proposal?.status === "proposed";
  const askAgent = () =>
    sendToAgentChat({
      message: selected.size ? `About these ${selected.size} reports: ` : "",
      context: JSON.stringify({ boardId, selectedNoteIds: [...selected] }),
      submit: false,
      openSidebar: true,
    });

  if (priorities.isLoading || notes.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading board...</div>;
  }
  if (priorities.error || notes.error) {
    return <div className="p-6 text-sm text-muted-foreground">The board could not load. Refresh to try again.</div>;
  }

  return (
    <div className="flex-1 p-4 bg-background h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-6 min-w-0 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h3 className="font-medium text-foreground">Problems</h3>
          <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">{problemCount}</span>
          <span className="text-xs text-muted-foreground ml-2">
            {reports.length} reports · ranked by priority{q ? ` · ${visible.length} match “${search.trim()}”` : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {resort?.status === "running" && (
            <span className="h-8 px-3 rounded-md bg-muted flex items-center gap-2 text-muted-foreground text-sm" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Re-sorting{resort.total ? ` ${resort.progress}/${resort.total}` : ""}
            </span>
          )}
          {revision.data?.undoable && resort?.status !== "running" && (
            <button
              type="button"
              disabled={undo.isPending}
              onClick={() => undo.mutate({ boardId })}
              title={`Undo codebook v${revision.data.undoable.version}: every card goes back exactly`}
              className="h-8 px-3 rounded-md bg-muted flex items-center gap-2 text-foreground text-sm font-medium hover:bg-muted/70 disabled:opacity-60"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Undo v{revision.data.undoable.version}
            </button>
          )}
          {(proposalOpen || pending > 0) && (
            <button
              type="button"
              onClick={() => setTeachOpen(true)}
              className={
                proposalOpen
                  ? "h-8 px-3 rounded-md bg-foreground text-background flex items-center gap-2 text-sm font-medium hover:opacity-90"
                  : "h-8 px-3 rounded-md bg-muted flex items-center gap-2 text-foreground text-sm font-medium hover:bg-muted/70"
              }
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {proposalOpen ? "Review the agent's proposal" : `Teach the agent (${pending})`}
            </button>
          )}
          <button
            type="button"
            aria-label="Add a problem"
            title="Add a problem"
            onClick={() =>
              sendToAgentChat({ message: "Add a new problem to this board: ", context: JSON.stringify({ boardId }), submit: false, openSidebar: true })
            }
            className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={askAgent}
            className="h-8 px-3 rounded-md bg-foreground text-background flex items-center justify-center text-sm font-medium whitespace-nowrap hover:opacity-90"
          >
            {selected.size ? `Ask about ${selected.size} selected` : "Ask the agent"}
          </button>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
        {columns.map((column) => (
          <BoardColumn
            key={column.id}
            column={column}
            selected={selected}
            rippled={rippled}
            onSelect={onSelect}
            onOpenProblem={setOpenProblem}
            onDrop={handleDrop}
            onTaskDragStart={(e, report) => {
              e.dataTransfer.setData("noteId", report.id);
              setDragged(report);
            }}
            onTaskDragEnd={() => setDragged(null)}
          />
        ))}
      </div>
      {dragged && <span className="sr-only" aria-live="polite">Moving {dragged.title}</span>}
      <ReportDrawer
        boardId={boardId}
        noteId={openNote}
        problems={themes.map((t) => ({ id: t.themeId, name: t.name }))}
        onOpenChange={(o) => !o && setOpenNote(null)}
      />
      <ProblemDrawer boardId={boardId} themeId={openProblem} onOpenChange={(o) => !o && setOpenProblem(null)} />
      <RevisionSheet boardId={boardId} open={teachOpen} onOpenChange={setTeachOpen} />
    </div>
  );
}
