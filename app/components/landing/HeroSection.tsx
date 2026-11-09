// Ported from Twisky (components/marketing/HeroSection.tsx): the same fade-in,
// typed headline and dashboard frame. The board inside the frame is the real
// Groundswell board column and card, filled from a snapshot of the demo board,
// and cards can be dragged between problems locally (nothing is saved).
import { Sparkles } from "lucide-react";
import React, { useEffect, useState } from "react";

import { BoardColumn, type Column } from "@/components/groundswell/BoardColumn";

import { OpenAppButton } from "./OpenAppButton";
import { SNAPSHOT, SNAPSHOT_COLUMNS } from "./snapshot";

const HEADLINE = "Turn feedback into fixes";

function useTypingAnimation(text: string, delay: number, start: boolean) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!start) {
      setShown("");
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      if (i <= text.length) setShown(text.slice(0, i++));
      else clearInterval(timer);
    }, delay);
    return () => clearInterval(timer);
  }, [text, delay, start]);
  return shown;
}

const NAV = ["Dashboard", "Board", "Review", "Briefs"];
const SOURCES = ["GitHub issues", "CSV upload", "Pasted text"];

function SnapshotBoard() {
  const [columns, setColumns] = useState<Column[]>(SNAPSHOT_COLUMNS);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const onDrop = (e: React.DragEvent, to: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("noteId");
    setColumns((cols) => {
      const from = cols.find((c) => c.reports.some((r) => r.id === id));
      if (!from || from.id === to) return cols;
      const card = from.reports.find((r) => r.id === id)!;
      return cols.map((c) =>
        c.id === from.id
          ? { ...c, reports: c.reports.filter((r) => r.id !== id), total: (c.total ?? 0) - 1 }
          : c.id === to
            ? { ...c, reports: [{ ...card, pinned: true }, ...c.reports], total: (c.total ?? 0) + 1 }
            : c,
      );
    });
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-full">
      {columns.map((column) => (
        <BoardColumn
          key={column.id}
          column={column}
          selected={selected}
          onSelect={(id) => setSelected((s) => (s.has(id) && s.size === 1 ? new Set() : new Set([id])))}
          onDrop={onDrop}
          onTaskDragStart={(e, r) => e.dataTransfer.setData("noteId", r.id)}
          onTaskDragEnd={() => {}}
        />
      ))}
    </div>
  );
}

export function HeroSection() {
  const [visible, setVisible] = useState(false);
  const [typing, setTyping] = useState(false);
  const headline = useTypingAnimation(HEADLINE, 80, typing);

  useEffect(() => {
    const el = document.getElementById("hero-section");
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          t = setTimeout(() => setTyping(true), 800);
        } else {
          setVisible(false);
          setTyping(false);
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (t) clearTimeout(t);
    };
  }, []);

  return (
    <section id="hero-section" className="relative w-full py-12 md:py-20 px-4 md:px-12 flex flex-col items-center justify-center overflow-hidden bg-background">
      <div className="absolute inset-0 cosmic-grid opacity-30" />

      <div className={`relative z-10 max-w-4xl text-center space-y-6 transition-all duration-700 transform ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-primary/10 text-primary border border-primary/20 backdrop-blur-sm">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            Agent-native feedback synthesis
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
        </div>

        <div className="min-h-[80px] md:min-h-[100px] lg:min-h-[120px] flex items-center justify-center">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-medium tracking-tighter text-balance text-center">
            <span className="sr-only">{HEADLINE}</span>
            <span aria-hidden="true" className="bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
              {typing ? headline : <span className="opacity-0">{HEADLINE}</span>}
            </span>
          </h1>
        </div>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
          Groundswell reads your GitHub issues, CSVs and notes, sorts them into problems ranked by real evidence, learns from every card you drag, and files the top ones as issues.
        </p>

        <div className="flex justify-center pt-4">
          <OpenAppButton />
        </div>
      </div>

      <div id="board" className={`w-full max-w-7xl mt-12 z-10 scroll-mt-24 transition-all duration-1000 delay-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-20"}`}>
        <div className="cosmic-glow relative rounded-xl overflow-hidden border border-border backdrop-blur-sm bg-card shadow-lg">
          <div className="flex items-center justify-between p-4 border-b border-border gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <div className="h-3 w-3 rounded-sm bg-foreground" />
              </div>
              <span className="text-foreground font-medium truncate">Agent-Native user feedback</span>
            </div>
            <span className="text-xs text-muted-foreground hidden sm:block">{SNAPSHOT.source} · {SNAPSHOT.reports} reports</span>
          </div>

          <div className="flex h-[600px] overflow-hidden">
            <div className="w-64 border-r border-border p-4 space-y-4 hidden md:block bg-card flex-shrink-0">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground uppercase">Navigation</div>
                <div className="space-y-1">
                  {NAV.map((item) => (
                    <div key={item} className={`flex items-center gap-3 px-3 py-2 rounded-md ${item === "Board" ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
                      <div className={`h-3 w-3 rounded-sm ${item === "Board" ? "bg-foreground" : "bg-muted-foreground/30"}`} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2 pt-4">
                <div className="text-xs text-muted-foreground uppercase">Sources</div>
                <div className="space-y-1">
                  {SOURCES.map((s, i) => (
                    <div key={s} className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground">
                      <div className="h-3 w-3 rounded-full" style={{ background: `hsl(var(--muted-foreground) / ${0.6 - i * 0.1})` }} />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 p-4 bg-background overflow-hidden flex flex-col min-w-0">
              <div className="flex items-center justify-between mb-6 min-w-0 gap-2">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <h3 className="font-medium text-foreground">Problems</h3>
                  <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">{SNAPSHOT.problems}</span>
                </div>
                <span className="text-xs text-muted-foreground truncate">Drag a card to another problem</span>
              </div>
              <div className="flex-1 min-h-0">
                <SnapshotBoard />
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-4">
          A snapshot of the real board, taken {SNAPSHOT.takenAt}: public issues from {SNAPSHOT.source}, scores from SQL, every quote checked word for word.
        </p>
      </div>
    </section>
  );
}
