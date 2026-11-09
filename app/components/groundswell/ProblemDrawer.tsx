/**
 * Problem drawer. Twisky's ConversationDrawer frame (same sheet, header, status
 * block and decision box) for one ranked problem: its SQL score and breakdown,
 * the Insight Brief with verified quotes, and filing it as a GitHub issue.
 * Filing always previews first (dry run) and names the repo before posting.
 */
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { Check, Copy, ExternalLink, FileText, GitPullRequest, MessageSquare, Sparkles, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface ProblemDrawerProps {
  boardId: string;
  themeId: string | null;
  onOpenChange: (open: boolean) => void;
}

const PARTS = [
  { key: "volume", label: "Volume", hint: "reports, duplicates collapsed" },
  { key: "reporters", label: "People", hint: "distinct reporters" },
  { key: "engagement", label: "Engagement", hint: "comments + 2 × reactions" },
  { key: "recency", label: "Recency", hint: "new in the last 30 days" },
] as const;

type Preview = { repo: string; title: string; body: string; labels: string[] };

function askAgent(message: string, context: Record<string, unknown>, submit: boolean) {
  sendToAgentChat({ message, context: JSON.stringify(context), submit, openSidebar: true });
}

export function ProblemDrawer({ boardId, themeId, onOpenChange }: ProblemDrawerProps) {
  const open = themeId !== null;
  const priorities = useActionQuery("get-priorities", { boardId }, { enabled: open });
  const brief = useActionQuery("get-brief", { boardId, theme: themeId ?? "" }, { enabled: open });
  const context = useActionQuery("get-brief-context", { boardId, theme: themeId ?? "", limit: 6, maxChars: 300 }, { enabled: open });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [repo, setRepo] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPreview(null);
    setRepo("");
    setConfirming(false);
  }, [themeId]);

  const file = useActionMutation("file-github-issue", {
    onSuccess: (r) => {
      if (r.dryRun) {
        setPreview({ repo: r.repo, title: r.title, body: r.body, labels: r.labels });
        setRepo((current) => current || r.repo);
        setConfirming(false);
      } else {
        setPreview(null);
        setConfirming(false);
        toast(`Filed in ${r.repo}`, {
          description: r.message,
          ...(r.issueUrl ? { action: { label: "Open issue", onClick: () => window.open(r.issueUrl!, "_blank", "noopener") } } : {}),
        });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Filing did not work."),
  });

  const theme = priorities.data?.themes.find((t) => t.themeId === themeId) ?? null;
  const b = brief.data?.brief ?? null;
  const notes = context.data?.notes.filter((n) => n.quote) ?? [];

  const previewIssue = () => {
    if (!b) return;
    file.mutate({ boardId, briefId: b.id, dryRun: true, ...(repo.trim() ? { repo: repo.trim() } : {}) });
  };
  const fileIssue = () => {
    if (!b || !repo.trim()) return;
    file.mutate({ boardId, briefId: b.id, repo: repo.trim(), dryRun: false });
  };
  const copyMarkdown = async () => {
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the text instead.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gs-app font-inter w-full sm:w-[640px] sm:max-w-[640px] p-0 flex flex-col">
        {!theme && <div className="h-full flex items-center justify-center text-sm text-muted-foreground">{priorities.isLoading ? "Loading problem..." : "This problem is no longer on the board."}</div>}
        {theme && (
          <>
            <SheetHeader className="p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground flex-shrink-0">
                  {theme.rank ? `#${theme.rank}` : "—"}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-left leading-snug">{theme.name}</SheetTitle>
                  <SheetDescription className="text-left">
                    {theme.internal ? "Not product feedback" : `Priority score ${theme.score} · every number from SQL`}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex items-center gap-4 pt-4 flex-wrap text-sm text-muted-foreground">
                <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> {theme.notes} reports{theme.uniqueProblems !== theme.notes ? ` → ${theme.uniqueProblems} distinct` : ""}</span>
                <span className="flex items-center gap-2"><Users className="h-4 w-4" /> {theme.reporters} people</span>
                <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> {theme.engagement} engagement</span>
                {theme.recent > 0 && <span>{theme.recent} new in 30 days</span>}
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-auto">
              {!theme.internal && (
                <div className="p-4 border-b bg-muted/20">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Why it ranks here</div>
                  <div className="space-y-2">
                    {PARTS.map((p) => {
                      const part = theme.breakdown[p.key];
                      return (
                        <div key={p.key} className="grid grid-cols-[96px_1fr_48px] items-center gap-3 text-xs">
                          <span title={p.hint} className="text-foreground">{p.label}</span>
                          <div className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                            <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.round(part.normalized * 100)}%` }} />
                          </div>
                          <span className="text-right tabular-nums text-muted-foreground">+{part.contribution}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="p-4 border-b">
                {brief.isLoading && <p className="text-sm text-muted-foreground">Loading brief...</p>}
                {!brief.isLoading && !b && (
                  <div className="rounded-lg border p-4 bg-background space-y-3">
                    <div className="text-sm font-medium flex items-center gap-2"><Sparkles className="h-4 w-4" /> No brief yet</div>
                    <p className="text-sm text-muted-foreground">The agent writes the problem, its impact and a next step, citing quotes the server checks word for word. Counts come from SQL.</p>
                    <Button size="sm" className="gap-1" onClick={() => askAgent(`Write an Insight Brief for the "${theme.name}" problem on this board.`, { boardId, theme: theme.themeId }, true)}>
                      <Sparkles className="h-3.5 w-3.5" /> Write the brief
                    </Button>
                  </div>
                )}
                {b && (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-foreground leading-snug">{b.title}</h3>
                      {b.filedIssueUrl ? (
                        <Badge variant="secondary" className="gap-1 flex-shrink-0"><Check className="h-3 w-3" /> Filed</Badge>
                      ) : (
                        <Badge variant="outline" className="flex-shrink-0">Brief</Badge>
                      )}
                    </div>
                    <section>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Problem</div>
                      <p className="text-sm text-foreground leading-relaxed">{b.problem}</p>
                    </section>
                    <section>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Impact</div>
                      <p className="text-sm text-foreground leading-relaxed">{b.impact}</p>
                    </section>
                    <section>
                      <div className="text-xs font-medium text-muted-foreground mb-2">Evidence · quotes checked word for word</div>
                      <ul className="space-y-2">
                        {b.evidence.map((e) => (
                          <li key={e.noteId + e.quote} className="rounded-md border-l-2 border-foreground/40 bg-muted/30 px-3 py-2">
                            <p className="text-sm text-foreground">“{e.quote}”</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {e.author ?? "Unknown"} ·{" "}
                              {e.url ? (
                                <a href={e.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">{e.title}</a>
                              ) : (
                                e.title
                              )}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section className="rounded-lg border p-3 bg-background">
                      <div className="text-xs font-medium flex items-center gap-1 mb-1"><Sparkles className="h-3.5 w-3.5" /> Suggested next step</div>
                      <p className="text-sm text-foreground">{b.nextStep}</p>
                    </section>

                    <div className="flex flex-wrap gap-2">
                      {b.filedIssueUrl ? (
                        <Button asChild size="sm" className="gap-1">
                          <a href={b.filedIssueUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open the filed issue</a>
                        </Button>
                      ) : (
                        <Button size="sm" className="gap-1" onClick={previewIssue} disabled={file.isPending}>
                          <GitPullRequest className="h-3.5 w-3.5" /> {file.isPending && !confirming ? "Preparing..." : "File as GitHub issue"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="gap-1" onClick={copyMarkdown}>
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy Markdown"}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => askAgent(`Rewrite the brief for "${theme.name}": `, { boardId, theme: theme.themeId, briefId: b.id }, false)}>
                        <Sparkles className="h-3.5 w-3.5" /> Revise with the agent
                      </Button>
                    </div>

                    {preview && !b.filedIssueUrl && (
                      <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
                        <div className="text-xs font-medium text-muted-foreground">Preview: nothing has been posted</div>
                        <div className="flex items-center gap-2">
                          <label htmlFor="gs-repo" className="text-xs text-muted-foreground whitespace-nowrap">Repository</label>
                          <input
                            id="gs-repo"
                            value={repo}
                            onChange={(e) => {
                              setRepo(e.target.value);
                              setConfirming(false);
                            }}
                            placeholder="owner/name"
                            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                          />
                        </div>
                        <div className="rounded-md border bg-background p-3 max-h-64 overflow-auto">
                          <p className="text-sm font-semibold text-foreground mb-2">{preview.title}</p>
                          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-inter">{preview.body}</pre>
                        </div>
                        {!confirming ? (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => setConfirming(true)} disabled={!repo.trim()}>Continue to file</Button>
                            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                            <p className="text-sm text-foreground">
                              This opens a public issue in <span className="font-semibold">{repo.trim()}</span> with your GitHub account.
                            </p>
                            <div className="flex gap-2">
                              <Button size="sm" variant="destructive" onClick={fileIssue} disabled={file.isPending}>
                                {file.isPending ? "Filing..." : `File in ${repo.trim()}`}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Back</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {notes.length > 0 && (
                <div className="p-4">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Most-discussed reports</div>
                  <ul className="space-y-2">
                    {notes.map((n) => (
                      <li key={n.id} className="text-sm">
                        <p className="text-foreground line-clamp-1">{n.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">“{n.quote}” · {n.author ?? "Unknown"} · {n.comments} comments</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="p-4 border-t flex gap-2">
              <Button size="sm" variant="outline" className="gap-1" onClick={() => askAgent(`About the "${theme.name}" problem: `, { boardId, theme: theme.themeId }, false)}>
                <Sparkles className="h-3.5 w-3.5" /> Ask the agent
              </Button>
              <Button size="sm" variant="outline" onClick={() => askAgent(`Find the duplicate reports in the "${theme.name}" problem on this board.`, { boardId, theme: theme.themeId }, true)}>
                Find duplicates
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
