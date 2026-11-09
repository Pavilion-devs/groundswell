/**
 * Briefs: every Insight Brief on the board, in Twisky's activity-row style.
 * A row opens the problem drawer (brief, quotes, file issue). Problems without
 * a brief are listed below so the agent can be asked to write one.
 */
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionQuery } from "@agent-native/core/client/hooks";
import { Check, FileText, Sparkles } from "lucide-react";
import { useState } from "react";

import { ProblemDrawer } from "./ProblemDrawer";

export function Briefs({ boardId, search }: { boardId: string; search: string }) {
  const briefs = useActionQuery("list-briefs", { boardId });
  const priorities = useActionQuery("get-priorities", { boardId });
  const [openProblem, setOpenProblem] = useState<string | null>(null);

  if (briefs.isLoading || priorities.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading briefs...</div>;
  if (!briefs.data || !priorities.data) return <div className="p-6 text-sm text-muted-foreground">Briefs could not load. Refresh to try again.</div>;

  const q = search.trim().toLowerCase();
  // The latest brief per problem; older ones stay reachable through the agent.
  const seen = new Set<string>();
  const latest = briefs.data.briefs.filter((b) => (seen.has(b.themeId) ? false : (seen.add(b.themeId), true)));
  const rows = latest.filter((b) => !q || [b.title, b.themeName ?? ""].some((s) => s.toLowerCase().includes(q)));
  const missing = priorities.data.themes.filter((t) => !t.internal && !seen.has(t.themeId)).slice(0, 5);

  const write = (names: string[], context: Record<string, unknown>) =>
    sendToAgentChat({
      message: names.length === 1 ? `Write an Insight Brief for the "${names[0]}" problem on this board.` : `Write Insight Briefs for these problems on this board, one at a time: ${names.map((n) => `"${n}"`).join(", ")}.`,
      context: JSON.stringify({ boardId, ...context }),
      submit: true,
      openSidebar: true,
    });

  return (
    <div className="flex-1 p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold dashboard-title">Briefs</h1>
            <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">{latest.length}</span>
          </div>
          <p className="text-sm dashboard-inactive">Evidence-backed write-ups of the top problems, ready to file as issues.</p>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 dashboard-stat-card rounded-lg text-sm text-muted-foreground flex items-center gap-3">
            <FileText className="h-5 w-5" /> {q ? `No brief matches “${search.trim()}”.` : "No briefs yet. Ask the agent to write one for a top problem below."}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((b) => (
              <button
                type="button"
                key={b.id}
                onClick={() => setOpenProblem(b.themeId)}
                className="w-full text-left flex flex-col md:flex-row md:items-center gap-4 p-4 dashboard-stat-card rounded-lg hover:opacity-90"
              >
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
                  {b.rank ? `#${b.rank}` : <FileText className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium dashboard-title truncate">{b.title}</p>
                  <p className="text-xs dashboard-inactive truncate">
                    {b.themeName ?? "Problem removed"} · {b.evidence} verified quote{b.evidence === 1 ? "" : "s"}
                    {b.score !== null ? ` · score ${b.score} when written` : ""} · {new Date(b.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {b.filedIssueUrl ? (
                    <span className="text-xs font-medium flex items-center gap-1 dashboard-title"><Check className="h-3.5 w-3.5" /> Filed</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not filed</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {missing.length > 0 && !q && (
          <section className="space-y-3" aria-label="Problems without a brief">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-semibold dashboard-title">Top problems without a brief</h3>
              {missing.length > 1 && (
                <button
                  type="button"
                  onClick={() => write(missing.slice(0, 3).map((t) => t.name), { themes: missing.slice(0, 3).map((t) => t.themeId) })}
                  className="h-8 px-3 rounded-md bg-foreground text-background text-sm font-medium flex items-center gap-1 hover:opacity-90"
                >
                  <Sparkles className="h-4 w-4" /> Write briefs for the top {Math.min(3, missing.length)}
                </button>
              )}
            </div>
            {missing.map((t) => (
              <div key={t.themeId} className="flex items-center gap-4 p-4 dashboard-stat-card rounded-lg">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">#{t.rank}</div>
                <button type="button" onClick={() => setOpenProblem(t.themeId)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium dashboard-title truncate">{t.name}</p>
                  <p className="text-xs dashboard-inactive">{t.notes} reports · {t.reporters} people · score {t.score}</p>
                </button>
                <button
                  type="button"
                  onClick={() => write([t.name], { theme: t.themeId })}
                  className="h-8 px-3 rounded-md bg-muted text-foreground text-sm font-medium flex items-center gap-1 hover:bg-muted/70 flex-shrink-0"
                >
                  <Sparkles className="h-4 w-4" /> Write brief
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
      <ProblemDrawer boardId={boardId} themeId={openProblem} onOpenChange={(o) => !o && setOpenProblem(null)} />
    </div>
  );
}
