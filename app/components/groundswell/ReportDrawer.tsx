/**
 * Report drawer. Ported from Twisky's ConversationDrawer: the same right-hand
 * sheet, header, status block and "AI Decision" box. Here the status is the
 * report's problem (changing it calls move-notes, like dragging), the decision
 * box shows the agent's placement, and the body highlights the verified quote.
 */
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { Clock, ExternalLink, MessageSquare, Pin, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface ReportDrawerProps {
  boardId: string;
  noteId: string | null;
  problems: Array<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
}

function Highlighted({ text, quote }: { text: string; quote: string | null }) {
  const at = quote ? text.indexOf(quote) : -1;
  if (!quote || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-foreground/15 text-foreground rounded px-0.5">{quote}</mark>
      {text.slice(at + quote.length)}
    </>
  );
}

export function ReportDrawer({ boardId, noteId, problems, onOpenChange }: ReportDrawerProps) {
  const open = noteId !== null;
  const note = useActionQuery("get-note", { id: noteId ?? "" }, { enabled: open });
  const move = useActionMutation("move-notes", {
    onSuccess: (r) => toast(r.message),
    onError: (e) => toast.error(e instanceof Error ? e.message : "The move did not save."),
  });
  const n = note.data;
  const p = n?.placement ?? null;
  const confidence = p?.confidence != null ? Math.round(p.confidence * 100) : null;
  const guess = p && !p.themeId && p.suggestedThemeId ? problems.find((t) => t.id === p.suggestedThemeId)?.name : null;
  const body = n?.body?.trim() ?? "";
  const quoteInBody = !!(p?.quote && body.includes(p.quote));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gs-app font-inter w-full sm:w-[600px] sm:max-w-[600px] p-0 flex flex-col">
        {note.isLoading && <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading report...</div>}
        {note.error && !note.isLoading && <div className="h-full flex items-center justify-center text-sm text-destructive">The report could not load.</div>}
        {n && !note.isLoading && (
          <>
            <SheetHeader className="p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground flex-shrink-0">
                  {(n.author ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-left leading-snug">
                    <Highlighted text={n.title ?? "(untitled)"} quote={quoteInBody ? null : (p?.quote ?? null)} />
                  </SheetTitle>
                  <SheetDescription className="text-left">
                    {n.author ?? "Unknown"} · #{n.externalId}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex items-center gap-4 pt-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Opened {n.sourceCreatedAt ? new Date(n.sourceCreatedAt).toLocaleDateString() : "unknown"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {n.comments} comments · {n.reactions} reactions
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 flex-wrap">
                {n.state && <Badge variant="outline" className="text-xs capitalize">{n.state}</Badge>}
                {n.labels.map((l) => (
                  <Badge key={l} variant="outline" className="text-xs">{l}</Badge>
                ))}
                {p?.pinned && (
                  <Badge variant="secondary" className="text-xs gap-1"><Pin className="h-3 w-3" /> Placed by you</Badge>
                )}
              </div>
            </SheetHeader>

            <div className="p-4 border-b bg-muted/20">
              <label htmlFor="gs-problem" className="text-xs font-medium text-muted-foreground">Problem</label>
              <select
                id="gs-problem"
                className="mt-1 flex h-8 w-full items-center rounded-md border border-input bg-background px-3 text-sm"
                value={p?.themeId ?? ""}
                disabled={move.isPending}
                onChange={(e) => move.mutate({ boardId, noteIds: [n.id], to: e.target.value || null })}
              >
                <option value="">Unsorted</option>
                {problems.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              {p && (
                <div className="mt-3 rounded-lg border p-3 bg-background space-y-1.5">
                  <div className="text-xs font-medium flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    {p.placedBy === "user" ? "Your placement" : "Agent's placement"}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {confidence !== null && <span className="font-medium">{confidence}% confidence</span>}
                    {guess && <span className="text-muted-foreground">Best guess: {guess}</span>}
                  </div>
                  {p.rationale && <div className="text-xs text-muted-foreground">{p.rationale}</div>}
                  {p.quote && (
                    <div className="text-xs text-muted-foreground">
                      Quote checked word for word against the report.
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {n.url && (
                  <Button asChild size="sm" variant="outline" className="gap-1">
                    <a href={n.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Open on GitHub
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    // Close the drawer first: the agent panel cannot take a message while a modal sheet is open.
                    onOpenChange(false);
                    setTimeout(() => sendToAgentChat({ message: `About the report "${n.title ?? ""}": `, context: JSON.stringify({ boardId, noteId: n.id }), submit: false, openSidebar: true }), 200);
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Ask the agent
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed break-words">
                {body ? <Highlighted text={body} quote={quoteInBody ? (p?.quote ?? null) : null} /> : "No description."}
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
