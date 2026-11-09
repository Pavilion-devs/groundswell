/**
 * Board dashboard. Ported from Twisky's DashboardMainContent: the same stat
 * cards and activity rows, filled with Groundswell's SQL facts (get-board,
 * get-priorities) and the agent's recent runs.
 */
import { useActionQuery } from "@agent-native/core/client/hooks";
import { CheckCircle2, Inbox, Layers, MessageSquare, TrendingUp } from "lucide-react";
import { Link } from "react-router";

const RUN_LABEL: Record<string, string> = {
  import: "Imported feedback",
  classify: "Sorted reports into problems",
  resort: "Re-sorted after you taught it",
  revise: "Revised the problem definitions",
  dedupe: "Grouped duplicate reports",
  brief: "Wrote an Insight Brief",
  codebook: "Drafted the problems",
};

function when(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function Dashboard({ boardId, search }: { boardId: string; search: string }) {
  const board = useActionQuery("get-board", { id: boardId });
  const priorities = useActionQuery("get-priorities", { boardId });

  if (board.isLoading || priorities.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading dashboard...</div>;
  }
  if (!board.data || !priorities.data) {
    return <div className="p-6 text-sm text-muted-foreground">The dashboard could not load. Refresh to try again.</div>;
  }

  const counts = board.data.counts;
  const feedback = priorities.data.themes.filter((t) => !t.internal);
  const rising = feedback.filter((t) => t.recent >= 10).length;
  const q = search.trim().toLowerCase();
  const top = feedback.filter((t) => !q || t.name.toLowerCase().includes(q)).slice(0, 8);
  const base = `/boards/${boardId}`;

  const stats = [
    { icon: MessageSquare, value: counts.notes, label: "Reports", href: base },
    { icon: Layers, value: feedback.length, label: "Problems", href: base },
    { icon: Inbox, value: counts.unsorted, label: "Need your review", href: `${base}/review` },
    { icon: TrendingUp, value: rising, label: "Rising (10+ new in 30 days)", href: base },
  ];

  return (
    <div className="flex-1 p-6">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold dashboard-title">{board.data.title}</h1>
          <p className="text-sm dashboard-inactive mt-1">
            {board.data.sources.map((s) => s.label).join(", ")} · ranked from {counts.notes} reports
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.label} to={s.href} className="dashboard-stat-card rounded-xl p-5 space-y-3 hover:opacity-90 transition-opacity block">
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-bold dashboard-title">{s.value}</p>
                  <p className="text-sm dashboard-inactive">{s.label}</p>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className="space-y-4" aria-label="Top problems">
            <h3 className="text-sm font-semibold dashboard-title">Top problems</h3>
            <div className="space-y-3">
              {top.map((t) => (
                <Link key={t.themeId} to={base} className="flex items-center gap-4 p-4 dashboard-stat-card rounded-lg">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
                    #{t.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium dashboard-title truncate">{t.name}</p>
                    <p className="text-xs dashboard-inactive">
                      {t.notes === t.uniqueProblems ? `${t.notes} reports` : `${t.notes} reports → ${t.uniqueProblems} distinct`} · {t.reporters} people
                      {t.recent >= 10 ? ` · ${t.recent} new in 30 days` : ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold dashboard-title">{t.score}</p>
                    <p className="text-xs dashboard-inactive">score</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="space-y-4" aria-label="Recent agent activity">
            <h3 className="text-sm font-semibold dashboard-title">Recent activity</h3>
            <div className="space-y-3">
              {board.data.recentRuns.length === 0 ? (
                <div className="p-4 dashboard-stat-card rounded-lg text-sm text-muted-foreground">No agent work on this board yet.</div>
              ) : (
                board.data.recentRuns.map((r) => (
                  <div key={r.id} className="flex items-center gap-4 p-4 dashboard-stat-card rounded-lg">
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      {r.status === "succeeded" ? (
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium dashboard-title">{RUN_LABEL[r.kind] ?? r.kind}</p>
                      <p className="text-xs dashboard-inactive">
                        {r.total ? `${r.progress} of ${r.total} reports` : `${r.progress} reports`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground font-medium capitalize">{r.status}</p>
                      <p className="text-xs dashboard-inactive">{when(r.finishedAt ?? r.createdAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
