// Ported from Twisky (components/marketing/Features.tsx): same grid, hover and
// expand behaviour; the collapsible is plain state instead of Radix.
import { ChevronDown, FileText, GitPullRequest, Inbox, ListOrdered, MousePointerClick, Quote } from "lucide-react";
import React, { useEffect, useState } from "react";

const FEATURES = [
  {
    title: "Import where feedback lives",
    description: "Pull GitHub issues, upload a CSV or paste text. Webhooks keep the board current.",
    more: "Every report is stored once with its author, date, comments and reactions. New issues arrive through a GitHub webhook and land on the board while you watch, sorted by the same agent.",
    icon: Inbox,
  },
  {
    title: "Sorted by an agent, checked by the server",
    description: "The agent writes a codebook of problems and places every report with a quote.",
    more: "Each placement carries a confidence, a rationale and a quote. The server rejects any quote that is not a word-for-word substring of the report, so the evidence you see is always real.",
    icon: Quote,
  },
  {
    title: "Teach it by dragging",
    description: "Move a card and it stays put. Your moves become a proposed codebook revision.",
    more: "Cards you place are pinned; re-sorts never move them. A few moves are enough for the agent to propose sharper definitions, with every change citing the moves behind it. Apply it, watch related reports re-sort, or undo it exactly.",
    icon: MousePointerClick,
  },
  {
    title: "Ranked by evidence",
    description: "Scores come from SQL: volume, distinct people, engagement and recency.",
    more: "Duplicates are collapsed before counting. You can change the weights, and every score shows its per-metric breakdown. The model never makes up a number.",
    icon: ListOrdered,
  },
  {
    title: "Briefs and issues",
    description: "Turn a top problem into a brief with quotes, then file it as a GitHub issue.",
    more: "Briefs cite the reports they are built from and never @mention people. Filing runs as a dry run first and only posts to the repository you choose.",
    icon: GitPullRequest,
  },
  {
    title: "One set of actions everywhere",
    description: "The board, the chat, MCP and automations all call the same actions.",
    more: "Groundswell is agent-native: anything you can do on the board, the agent can do from chat, another agent can do over MCP, and an automation can do on a schedule.",
    icon: FileText,
  },
];

export function Features() {
  const [open, setOpen] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById("features");
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setVisible(true), { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="features" className="w-full py-12 md:py-16 px-4 md:px-12 scroll-mt-20">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-medium tracking-tighter">From a pile of feedback to what to fix next</h2>
          <p className="text-muted-foreground text-lg">You and an agent shape the same board. It does the reading; you make the calls.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((f, i) => {
            const isOpen = open === i;
            const isHot = hovered === i || isOpen;
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                className={`group relative rounded-xl border overflow-hidden transform hover:scale-105 hover:-translate-y-2 ${
                  isOpen
                    ? "border-primary/60 shadow-xl shadow-primary/20 bg-gradient-to-br from-primary/5 via-card to-primary/5"
                    : hovered === i
                      ? "border-primary/40 shadow-lg shadow-primary/10 bg-card"
                      : "border-border cosmic-gradient hover:border-primary/30"
                } ${visible ? "opacity-100 translate-y-0 transition-all duration-700 ease-out" : "opacity-0 translate-y-8"}`}
                style={{ transitionDelay: visible ? `${i * 100}ms` : "0ms" }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="relative w-full text-left p-6 flex flex-col z-10"
                >
                  <div className="flex justify-between items-start">
                    <div className={`h-16 w-16 rounded-full flex items-center justify-center mb-6 transition-all duration-500 ${isHot ? "bg-primary/20 shadow-lg shadow-primary/30 scale-110" : "bg-muted/30 group-hover:bg-primary/10"}`}>
                      <Icon size={24} aria-hidden="true" className={`transition-all duration-500 ${hovered === i ? "text-primary scale-125 rotate-12" : isOpen ? "text-primary scale-110 rotate-6" : "text-muted-foreground group-hover:text-primary"}`} />
                    </div>
                    <ChevronDown aria-hidden="true" className={`h-5 w-5 transition-all duration-300 ${isOpen ? "rotate-180 text-primary" : isHot ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <h3 className={`text-xl font-medium tracking-tighter mb-3 transition-colors duration-300 ${isHot ? "text-primary" : "text-foreground"}`}>{f.title}</h3>
                  <p className={`transition-colors duration-300 ${isHot ? "text-foreground" : "text-muted-foreground"}`}>{f.description}</p>
                </button>
                {isOpen && (
                  <div className="relative z-10 px-6 pb-6 pt-2">
                    <div className="pt-3 border-t border-border">
                      <p className="text-muted-foreground">{f.more}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
