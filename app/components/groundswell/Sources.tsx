/**
 * Sources: where the board's feedback comes from, in Twisky's stat-card style.
 * GitHub sources can be re-synced; new feedback comes in from a GitHub repo, a
 * CSV file or pasted text. Imported reports land in Unsorted, and the agent is
 * asked to sort them.
 */
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { ClipboardPaste, FileSpreadsheet, Github, RefreshCw } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

const KIND = {
  github: { label: "GitHub issues", icon: Github },
  csv: { label: "CSV upload", icon: FileSpreadsheet },
  text: { label: "Pasted text", icon: ClipboardPaste },
} as const;

type Kind = keyof typeof KIND;

function when(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

function sortNew(boardId: string, inserted: number) {
  sendToAgentChat({
    message: `I imported ${inserted} new report${inserted === 1 ? "" : "s"} onto this board. Sort the unsorted reports into the existing problems.`,
    context: JSON.stringify({ boardId }),
    submit: true,
    openSidebar: true,
  });
}

function imported(boardId: string, r: { inserted: number; updated: number; message: string }) {
  toast(`${r.inserted} new, ${r.updated} updated`, {
    description: r.message,
    ...(r.inserted > 0 ? { action: { label: "Sort them", onClick: () => sortNew(boardId, r.inserted) } } : {}),
  });
}

const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function ImportPanel({ boardId }: { boardId: string }) {
  const [kind, setKind] = useState<Kind>("github");
  const [repo, setRepo] = useState("");
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "The import did not work.");
  const github = useActionMutation("add-github-source", { onSuccess: (r) => (setRepo(""), imported(boardId, r)), onError });
  const csvImport = useActionMutation("import-csv", { onSuccess: (r) => (setCsv(null), setLabel(""), imported(boardId, r)), onError });
  const textImport = useActionMutation("import-text", { onSuccess: (r) => (setText(""), setLabel(""), imported(boardId, r)), onError });
  const busy = github.isPending || csvImport.isPending || textImport.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "github" && repo.trim()) github.mutate({ boardId, repo: repo.trim() });
    if (kind === "csv" && csv) csvImport.mutate({ boardId, csv: csv.text, label: label.trim() || csv.name });
    if (kind === "text" && text.trim()) textImport.mutate({ boardId, text, label: label.trim() || "Pasted feedback" });
  };

  return (
    <form onSubmit={submit} className="p-4 dashboard-stat-card rounded-lg space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold dashboard-title">Add feedback</h3>
        <div className="flex gap-1 rounded-full border border-border p-1" role="tablist">
          {(Object.keys(KIND) as Kind[]).map((k) => {
            const Icon = KIND[k].icon;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cn("px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 transition-colors", kind === k ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
              >
                <Icon className="h-3.5 w-3.5" /> {KIND[k].label}
              </button>
            );
          })}
        </div>
      </div>

      {kind === "github" && (
        <div className="space-y-1">
          <label htmlFor="gs-src-repo" className="text-xs text-muted-foreground">Public repository</label>
          <input id="gs-src-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name or a github.com URL" className={inputClass} />
          <p className="text-xs text-muted-foreground">Imports issues (not pull requests), skips bots. Importing the same repo again re-syncs it.</p>
        </div>
      )}
      {kind === "csv" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="gs-src-csv" className="text-xs text-muted-foreground">CSV file with a header row</label>
            <input
              id="gs-src-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setCsv(f ? { name: f.name.replace(/\.csv$/i, ""), text: await f.text() } : null);
              }}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-muted file:px-3 file:text-sm file:text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="gs-src-label" className="text-xs text-muted-foreground">Name (optional)</label>
            <input id="gs-src-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={csv?.name ?? "Zendesk export Oct 2026"} className={inputClass} />
          </div>
          <p className="text-xs text-muted-foreground">Columns (text, title, author, date, link) are detected automatically.</p>
        </div>
      )}
      {kind === "text" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="gs-src-text" className="text-xs text-muted-foreground">Feedback, one report per paragraph</label>
            <textarea id="gs-src-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Paste interview notes, a Slack thread, survey answers..." />
          </div>
          <div className="space-y-1">
            <label htmlFor="gs-src-label2" className="text-xs text-muted-foreground">Name (optional)</label>
            <input id="gs-src-label2" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pasted feedback" className={inputClass} />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={busy || (kind === "github" ? !repo.trim() : kind === "csv" ? !csv : !text.trim())}
        className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Importing..." : "Import"}
      </button>
    </form>
  );
}

export function Sources({ boardId, search }: { boardId: string; search: string }) {
  const board = useActionQuery("get-board", { id: boardId });
  const [syncing, setSyncing] = useState<string | null>(null);
  const sync = useActionMutation("sync-source", {
    onSuccess: (r) => {
      setSyncing(null);
      imported(boardId, r);
    },
    onError: (e) => {
      setSyncing(null);
      toast.error(e instanceof Error ? e.message : "The sync did not work.");
    },
  });

  if (board.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading sources...</div>;
  if (!board.data) return <div className="p-6 text-sm text-muted-foreground">Sources could not load. Refresh to try again.</div>;

  const q = search.trim().toLowerCase();
  const sources = board.data.sources.filter((s) => !q || s.label.toLowerCase().includes(q));

  return (
    <div className="flex-1 p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold dashboard-title">Sources</h1>
            <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">{board.data.sources.length}</span>
          </div>
          <p className="text-sm dashboard-inactive">{board.data.counts.notes} reports · {board.data.counts.unsorted} not yet in a problem</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sources.map((s) => {
            const meta = KIND[(s.kind as Kind) in KIND ? (s.kind as Kind) : "text"];
            const Icon = meta.icon;
            const stats = s.stats ?? {};
            const notes = typeof stats.notes === "number" ? stats.notes : null;
            const bots = typeof stats.botsSkipped === "number" ? stats.botsSkipped : null;
            return (
              <div key={s.id} className="p-5 dashboard-stat-card rounded-lg flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold dashboard-title truncate">{s.label}</p>
                      <p className="text-xs dashboard-inactive">{meta.label}</p>
                    </div>
                  </div>
                  {s.kind === "github" && (
                    <button
                      type="button"
                      disabled={syncing !== null}
                      onClick={() => {
                        setSyncing(s.id);
                        sync.mutate({ sourceId: s.id });
                      }}
                      className="h-8 px-3 rounded-md bg-muted text-foreground text-sm font-medium flex items-center gap-1.5 hover:bg-muted/70 disabled:opacity-60 flex-shrink-0"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", syncing === s.id && "animate-spin")} /> {syncing === s.id ? "Syncing" : "Sync now"}
                    </button>
                  )}
                </div>
                <div className="flex gap-6 text-xs">
                  {notes !== null && (
                    <div><p className="text-lg font-semibold dashboard-title">{notes}</p><p className="dashboard-inactive">reports</p></div>
                  )}
                  {bots !== null && bots > 0 && (
                    <div><p className="text-lg font-semibold dashboard-title">{bots}</p><p className="dashboard-inactive">bot issues skipped</p></div>
                  )}
                  <div><p className="text-lg font-semibold dashboard-title">{when(s.lastSyncedAt)}</p><p className="dashboard-inactive">last synced</p></div>
                </div>
              </div>
            );
          })}
          {sources.length === 0 && (
            <div className="p-6 dashboard-stat-card rounded-lg text-sm text-muted-foreground">{q ? `No source matches “${search.trim()}”.` : "No sources yet. Add feedback below."}</div>
          )}
        </div>

        <ImportPanel boardId={boardId} />
      </div>
    </div>
  );
}
