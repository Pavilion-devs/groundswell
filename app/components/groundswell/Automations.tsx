/**
 * Automations: the agent's background jobs for this app (Agent-Native
 * automations: a GitHub webhook that sorts new issues as they arrive, a weekly
 * digest), in Twisky's stat-card style, plus the digests they produced.
 * Automations are framework resources, listed and switched on or off through
 * the framework's automations route; the agent creates them from chat.
 */
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { appPath } from "@agent-native/core/client/api-path";
import { useActionQuery } from "@agent-native/core/client/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, Copy, Sparkles, Webhook, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";

interface Automation {
  id: string;
  name: string;
  path: string;
  owner: string;
  appId?: string;
  canUpdate: boolean;
  triggerType: "schedule" | "event" | "webhook" | string;
  webhookPath?: string;
  schedule?: string;
  scheduleDescription?: string;
  event?: string;
  enabled: boolean;
  lastStatus?: string;
  lastRun?: string;
  lastError?: string;
  nextRun?: string;
  body: string;
}

const ROUTE = "/_agent-native/automations";

function when(iso?: string): string {
  if (!iso) return "never";
  const diff = Date.parse(iso) - Date.now();
  const mins = Math.round(Math.abs(diff) / 60_000);
  const days = Math.round(mins / 1440);
  const text = mins < 60 ? `${Math.max(1, mins)} min` : mins < 60 * 24 ? `${Math.round(mins / 60)} h` : `${days} day${days === 1 ? "" : "s"}`;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

function title(a: Automation): string {
  if (/new-issues/.test(a.name)) return "New GitHub issues sort themselves";
  if (/digest/.test(a.name)) return "Weekly digest";
  return a.name.replace(/^groundswell-/, "").replace(/-/g, " ");
}

const SUGGESTIONS = [
  {
    match: /new-issues/,
    label: "New GitHub issues sort themselves",
    message: "Set up a webhook automation so new GitHub issues on this board's repo are imported and sorted as they arrive.",
  },
  {
    match: /digest/,
    label: "Weekly digest every Monday",
    message: "Set up a weekly digest automation for this board: every Monday at 9am, write a digest from get-digest-data and save it.",
  },
];

export function Automations({ boardId }: { boardId: string; search: string }) {
  const qc = useQueryClient();
  const [openDigest, setOpenDigest] = useState<string | null>(null);
  const automations = useQuery({
    queryKey: ["gs-automations"],
    queryFn: async (): Promise<Automation[]> => {
      const res = await fetch(appPath(ROUTE), { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Automations could not load (${res.status}).`);
      return res.json();
    },
    refetchInterval: 30_000,
  });
  const digests = useActionQuery("list-digests", { boardId, limit: 10 });

  const toggle = useMutation({
    mutationFn: async (a: Automation) => {
      const res = await fetch(appPath(ROUTE), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ owner: a.owner, path: a.path, enabled: !a.enabled }),
      });
      if (!res.ok) throw new Error(`Could not update the automation (${res.status}).`);
    },
    onMutate: async (a) => {
      await qc.cancelQueries({ queryKey: ["gs-automations"] });
      const before = qc.getQueryData<Automation[]>(["gs-automations"]);
      qc.setQueryData<Automation[]>(["gs-automations"], (list) => list?.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)));
      return { before };
    },
    onError: (e, _a, ctx) => {
      if (ctx?.before) qc.setQueryData(["gs-automations"], ctx.before);
      toast.error(e instanceof Error ? e.message : "Could not update the automation.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["gs-automations"] }),
  });

  // This app's automations for this board (the agent names them after the board and puts its id in the prompt).
  const mine = (automations.data ?? []).filter((a) => (a.appId ?? "groundswell") === "groundswell" && (a.body.includes(boardId) || a.name.startsWith("groundswell-")));
  const missing = SUGGESTIONS.filter((s) => !mine.some((a) => s.match.test(a.name)));
  const ask = (message: string) => sendToAgentChat({ message, context: JSON.stringify({ boardId }), submit: true, openSidebar: true });

  return (
    <div className="flex-1 p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold dashboard-title">Automations</h1>
            <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">{mine.length}</span>
          </div>
          <p className="text-sm dashboard-inactive">The agent keeps working while you are away. It runs the same actions you use on the board.</p>
        </div>

        {automations.isLoading && <div className="p-6 dashboard-stat-card rounded-lg text-sm text-muted-foreground">Loading automations...</div>}
        {automations.error && <div className="p-6 dashboard-stat-card rounded-lg text-sm text-muted-foreground">{(automations.error as Error).message}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {mine.map((a) => {
            const Icon = a.triggerType === "webhook" ? Webhook : a.triggerType === "schedule" ? CalendarClock : Zap;
            return (
              <div key={a.id} className="p-5 dashboard-stat-card rounded-lg flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold dashboard-title truncate">{title(a)}</p>
                      <p className="text-xs dashboard-inactive">
                        {a.triggerType === "webhook" ? "On every GitHub issues webhook" : a.triggerType === "schedule" ? (a.scheduleDescription ?? a.schedule) : `On ${a.event ?? "an event"}`}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={a.enabled}
                    disabled={!a.canUpdate || toggle.isPending}
                    onCheckedChange={() => toggle.mutate(a)}
                    aria-label={`${title(a)}: ${a.enabled ? "on" : "off"}`}
                  />
                </div>
                <p className="text-xs dashboard-inactive line-clamp-2">{a.body}</p>
                <div className="flex flex-wrap gap-6 text-xs">
                  <div>
                    <p className="text-sm font-semibold dashboard-title">{a.lastStatus ? a.lastStatus.charAt(0).toUpperCase() + a.lastStatus.slice(1) : "Not run yet"}</p>
                    <p className="dashboard-inactive">last run {when(a.lastRun)}</p>
                  </div>
                  {a.triggerType === "schedule" && a.enabled && (
                    <div>
                      <p className="text-sm font-semibold dashboard-title">{when(a.nextRun)}</p>
                      <p className="dashboard-inactive">next run</p>
                    </div>
                  )}
                  {a.webhookPath && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(new URL(a.webhookPath!, window.location.origin).href);
                          toast("Webhook URL copied", { description: "Add it to the repo's GitHub webhooks for the Issues event. Keep it secret." });
                        } catch {
                          toast.error("Could not copy the webhook URL.");
                        }
                      }}
                      className="h-8 px-3 rounded-md bg-muted text-foreground text-xs font-medium flex items-center gap-1.5 hover:bg-muted/70 self-end"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy webhook URL
                    </button>
                  )}
                </div>
                {a.lastError && <p className="text-xs text-destructive">{a.lastError}</p>}
              </div>
            );
          })}
          {missing.map((s) => (
            <div key={s.label} className="p-5 dashboard-stat-card rounded-lg flex flex-col gap-3 border-dashed">
              <p className="text-sm font-semibold dashboard-title">{s.label}</p>
              <p className="text-xs dashboard-inactive">Not set up on this board yet. The agent creates it from one message.</p>
              <button
                type="button"
                onClick={() => ask(s.message)}
                className="h-8 px-3 rounded-md bg-foreground text-background text-sm font-medium flex items-center gap-1 hover:opacity-90 self-start"
              >
                <Sparkles className="h-4 w-4" /> Set it up with the agent
              </button>
            </div>
          ))}
        </div>

        <section className="space-y-3" aria-label="Digests">
          <h3 className="text-sm font-semibold dashboard-title">Digests</h3>
          {digests.data?.digests.length ? (
            digests.data.digests.map((d) => (
              <div key={d.id} className="dashboard-stat-card rounded-lg">
                <button type="button" onClick={() => setOpenDigest(openDigest === d.id ? null : d.id)} className="w-full text-left flex items-center gap-4 p-4" aria-expanded={openDigest === d.id}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium dashboard-title truncate">{d.title}</p>
                    <p className="text-xs dashboard-inactive">
                      {new Date(d.periodStart).toLocaleDateString()} – {new Date(d.periodEnd).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openDigest === d.id ? "rotate-180" : ""}`} />
                </button>
                {openDigest === d.id && <pre className="px-4 pb-4 text-sm text-foreground whitespace-pre-wrap break-words font-inter">{d.body}</pre>}
              </div>
            ))
          ) : (
            <div className="p-4 dashboard-stat-card rounded-lg text-sm text-muted-foreground">{digests.isLoading ? "Loading digests..." : "No digests yet."}</div>
          )}
        </section>
      </div>
    </div>
  );
}
