/**
 * Review: reports the agent was not sure about. Twisky's activity-row style
 * (DashboardMainContent), one row per report, with the agent's best guess.
 * Accepting a guess or picking a problem calls move-notes, so each decision is
 * pinned and recorded as a correction the agent learns from.
 */
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { Check, Inbox, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { plainPreview } from "./ReportCard";
import { ReportDrawer } from "./ReportDrawer";

export function Review({ boardId, search }: { boardId: string; search: string }) {
  const notes = useActionQuery("list-notes", { boardId, unsorted: true, limit: 500 });
  const priorities = useActionQuery("get-priorities", { boardId });
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const move = useActionMutation("move-notes", {
    onError: (e, input) => {
      setDone((prev) => {
        const next = new Set(prev);
        for (const id of input.noteIds) next.delete(id);
        return next;
      });
      toast.error(e instanceof Error ? e.message : "The move did not save.");
    },
  });

  if (notes.isLoading || priorities.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading review...</div>;
  if (!notes.data || !priorities.data) return <div className="p-6 text-sm text-muted-foreground">Review could not load. Refresh to try again.</div>;

  const themes = priorities.data.themes;
  const nameOf = new Map(themes.map((t) => [t.themeId, t.name]));
  const q = search.trim().toLowerCase();
  const rows = notes.data.notes
    .filter((n) => !done.has(n.id))
    .filter((n) => !q || [n.title ?? "", n.excerpt, n.author ?? ""].some((s) => s.toLowerCase().includes(q)));

  const place = (noteId: string, to: string | null, label: string) => {
    setDone((prev) => new Set(prev).add(noteId));
    move.mutate(
      { boardId, noteIds: [noteId], to },
      {
        onSuccess: (r) =>
          toast(`Moved to ${label}`, {
            description: `Pinned. ${r.pendingCorrections} correction${r.pendingCorrections === 1 ? "" : "s"} waiting for the agent to learn from.`,
            ...(r.revisionSuggested
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
          }),
      },
    );
  };

  return (
    <div className="flex-1 p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold dashboard-title">Review</h1>
            <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">{rows.length}</span>
          </div>
          <p className="text-sm dashboard-inactive">Reports the agent was not sure about. Your choice is pinned and teaches it.</p>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 dashboard-stat-card rounded-lg text-sm text-muted-foreground flex items-center gap-3">
            <Inbox className="h-5 w-5" /> Nothing to review. Every report is in a problem.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((n) => {
              const guess = n.suggestedThemeId ? nameOf.get(n.suggestedThemeId) : undefined;
              return (
                <div key={n.id} className="flex flex-col md:flex-row md:items-center gap-4 p-4 dashboard-stat-card rounded-lg">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
                    {(n.author ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <button type="button" onClick={() => setOpenNote(n.id)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium dashboard-title truncate">{n.title ?? "(untitled)"}</p>
                    <p className="text-xs dashboard-inactive line-clamp-1">{plainPreview(n.excerpt)}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      {guess ? `Agent's guess: ${guess}${n.confidence != null ? ` (${Math.round(n.confidence * 100)}%)` : ""}` : "No guess: nothing fits well"}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {guess && n.suggestedThemeId && (
                      <button
                        type="button"
                        onClick={() => place(n.id, n.suggestedThemeId, guess)}
                        className="h-8 px-3 rounded-md bg-foreground text-background text-sm font-medium flex items-center gap-1 hover:opacity-90"
                      >
                        <Check className="h-4 w-4" /> Accept
                      </button>
                    )}
                    <label className="sr-only" htmlFor={`pick-${n.id}`}>Move to a problem</label>
                    <select
                      id={`pick-${n.id}`}
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm max-w-[220px]"
                      value=""
                      onChange={(e) => {
                        const t = themes.find((x) => x.themeId === e.target.value);
                        if (t) place(n.id, t.themeId, t.name);
                      }}
                    >
                      <option value="">Choose a problem…</option>
                      {themes.map((t) => (
                        <option key={t.themeId} value={t.themeId}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ReportDrawer
        boardId={boardId}
        noteId={openNote}
        problems={themes.map((t) => ({ id: t.themeId, name: t.name }))}
        onOpenChange={(o) => !o && setOpenNote(null)}
      />
    </div>
  );
}
