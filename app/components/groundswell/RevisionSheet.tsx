/**
 * Codebook revision review, in the Twisky drawer frame. Shows the agent's
 * proposed change to the problem definitions as a before/after diff, the moves
 * it learned from and how many reports it would re-sort. Apply makes it active
 * and hands the targeted re-sort to the agent; Reject keeps the moves pending.
 */
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { ArrowRight, Check, Minus, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface RevisionSheetProps {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Shape = { name: string; definition: string; includeRules: string[]; excludeRules: string[] };

function RuleDiff({ label, before, after }: { label: string; before: string[]; after: string[] }) {
  const removed = before.filter((r) => !after.includes(r));
  const added = after.filter((r) => !before.includes(r));
  if (!removed.length && !added.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-muted-foreground uppercase">{label}</div>
      {removed.map((r) => (
        <p key={`-${r}`} className="text-xs flex gap-1.5 text-muted-foreground line-through"><Minus className="h-3 w-3 mt-0.5 flex-shrink-0" />{r}</p>
      ))}
      {added.map((r) => (
        <p key={`+${r}`} className="text-xs flex gap-1.5 text-foreground"><Plus className="h-3 w-3 mt-0.5 flex-shrink-0" />{r}</p>
      ))}
    </div>
  );
}

function ShapeDiff({ before, after }: { before: Shape | null; after: Shape | null }) {
  const definitionChanged = (before?.definition ?? "") !== (after?.definition ?? "");
  return (
    <div className="space-y-2">
      {before && after && before.name !== after.name && (
        <p className="text-xs"><span className="line-through text-muted-foreground">{before.name}</span> <ArrowRight className="inline h-3 w-3" /> <span className="text-foreground">{after.name}</span></p>
      )}
      {definitionChanged && (
        <div className="grid gap-2">
          {before && <p className="text-xs text-muted-foreground line-through decoration-muted-foreground/60">{before.definition}</p>}
          {after && <p className="text-xs text-foreground">{after.definition}</p>}
        </div>
      )}
      <RuleDiff label="Include" before={before?.includeRules ?? []} after={after?.includeRules ?? []} />
      <RuleDiff label="Exclude" before={before?.excludeRules ?? []} after={after?.excludeRules ?? []} />
    </div>
  );
}

const OP_LABEL = { update: "Sharpened", add: "New problem", remove: "Removed" } as const;

export function RevisionSheet({ boardId, open, onOpenChange }: RevisionSheetProps) {
  const revision = useActionQuery("get-codebook-revision", { boardId }, { enabled: open });
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const apply = useActionMutation("apply-codebook-revision", {
    onSuccess: (r) => {
      onOpenChange(false);
      toast(`Applied v${r.version}`, { description: r.runId ? "The agent is re-sorting the reports it touched. Moved cards will flash." : r.message });
      if (r.runId) {
        sendToAgentChat({
          message: `I approved and applied codebook v${r.version}. Run the re-sort (run ${r.runId}) and tell me which notes moved.`,
          context: JSON.stringify({ boardId, runId: r.runId, codebookId: r.codebookId }),
          submit: true,
          openSidebar: true,
        });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not apply the revision."),
  });
  const reject = useActionMutation("reject-codebook-revision", {
    onSuccess: (r) => {
      setRejecting(false);
      setReason("");
      onOpenChange(false);
      toast(r.message);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reject the revision."),
  });

  const data = revision.data;
  const proposal = data?.proposal?.status === "proposed" ? data.proposal : null;
  const pending = data?.pendingCorrections ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gs-app font-inter w-full sm:w-[640px] sm:max-w-[640px] p-0 flex flex-col">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="text-left flex items-center gap-2"><Sparkles className="h-4 w-4" /> Teach the agent</SheetTitle>
          <SheetDescription className="text-left">
            {proposal
              ? `The agent read your moves and proposes v${proposal.version} of the problem definitions (now v${proposal.basedOnVersion}).`
              : "Your moves teach the agent. When you have made a few, it proposes sharper problem definitions for you to approve."}
          </SheetDescription>
          {proposal?.impact && (
            <div className="flex items-center gap-2 pt-3 flex-wrap">
              <Badge variant="outline">{proposal.entries.length} change{proposal.entries.length === 1 ? "" : "s"}</Badge>
              <Badge variant="outline">{proposal.corrections.length} moves learned from</Badge>
              <Badge variant="outline">{proposal.impact.notesToReSort} reports to re-sort</Badge>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-auto">
          {revision.isLoading && <p className="p-6 text-sm text-muted-foreground">Loading...</p>}
          {!revision.isLoading && !proposal && (
            <div className="p-6 space-y-4">
              <div className="rounded-lg border p-4 bg-background space-y-3">
                <p className="text-sm text-foreground">
                  {pending > 0 ? `${pending} move${pending === 1 ? "" : "s"} waiting to be learned from.` : "No moves waiting. Drag a card to the right problem to teach the agent."}
                </p>
                {pending > 0 && (
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      onOpenChange(false);
                      sendToAgentChat({
                        message: "Learn from the notes I moved on this board and propose a codebook revision.",
                        context: JSON.stringify({ boardId }),
                        submit: true,
                        openSidebar: true,
                      });
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Ask for a proposal
                  </Button>
                )}
              </div>
              {data?.proposal && data.proposal.status !== "proposed" && (
                <p className="text-xs text-muted-foreground">Last proposal (v{data.proposal.version}) was {data.proposal.status}{data.proposal.rejectReason ? `: “${data.proposal.rejectReason}”` : ""}.</p>
              )}
            </div>
          )}

          {proposal && (
            <>
              {proposal.summary && <p className="px-6 pt-4 text-sm text-foreground">{proposal.summary}</p>}
              <div className="p-4 space-y-3">
                {proposal.entries.map((e) => (
                  <div key={`${e.op}-${e.key}`} className="rounded-lg border p-3 bg-background space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{(e.after ?? e.before)?.name ?? e.key}</span>
                      <Badge variant={e.op === "remove" ? "destructive" : "secondary"} className="text-[11px] flex-shrink-0">{OP_LABEL[e.op]}</Badge>
                    </div>
                    <ShapeDiff before={e.before} after={e.after} />
                    <p className="text-xs text-muted-foreground border-t pt-2"><span className="font-medium">Why:</span> {e.why}</p>
                  </div>
                ))}
              </div>

              <div className="px-4 pb-4">
                <div className="text-xs font-medium text-muted-foreground mb-2">Moves it learned from</div>
                <ul className="space-y-2">
                  {proposal.corrections.map((c) => (
                    <li key={c.id} className="rounded-md bg-muted/30 px-3 py-2">
                      <p className="text-sm text-foreground line-clamp-1">{c.noteTitle}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                        {c.from?.name ?? "Unsorted"} <ArrowRight className="h-3 w-3" /> {c.to?.name ?? "Unsorted"}
                      </p>
                      {c.reason && <p className="text-xs text-muted-foreground italic mt-0.5">“{c.reason}”</p>}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        {proposal && (
          <div className="p-4 border-t space-y-3">
            {rejecting ? (
              <div className="space-y-2">
                <label htmlFor="gs-reject-reason" className="text-xs text-muted-foreground">Why not? (optional, the agent reads it next time)</label>
                <input
                  id="gs-reject-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={reject.isPending} onClick={() => reject.mutate({ boardId, codebookId: proposal.codebookId, ...(reason.trim() ? { reason: reason.trim() } : {}) })}>
                    {reject.isPending ? "Rejecting..." : "Reject proposal"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" className="gap-1" disabled={apply.isPending} onClick={() => apply.mutate({ boardId, codebookId: proposal.codebookId, slices: 3 })}>
                  <Check className="h-3.5 w-3.5" /> {apply.isPending ? "Applying..." : "Apply and re-sort"}
                </Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setRejecting(true)}>
                  <X className="h-3.5 w-3.5" /> Reject
                </Button>
                <span className="text-xs text-muted-foreground self-center">Cards you placed never move. You can undo exactly.</span>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
