/**
 * One problem (or Unsorted) on the board. Ported from Twisky's TaskColumn:
 * same frame, header and drop highlight.
 */
import React, { useState } from "react";

import { cn } from "@/lib/utils";

import { type Report, ReportCard } from "./ReportCard";

export interface Column {
  id: string;
  title: string;
  kind: "problem" | "unsorted" | "internal";
  rank: number | null;
  score: number | null;
  reports: Report[];
  /** Reports in the problem when only some are shown (the landing snapshot). */
  total?: number;
}

interface BoardColumnProps {
  column: Column;
  selected: ReadonlySet<string>;
  rippled?: ReadonlySet<string>;
  onSelect: (id: string, additive: boolean) => void;
  /** Open the problem drawer from the column title. */
  onOpenProblem?: (columnId: string) => void;
  onDrop: (e: React.DragEvent, columnId: string) => void;
  onTaskDragStart: (e: React.DragEvent, report: Report) => void;
  onTaskDragEnd: () => void;
}

export function BoardColumn({ column, selected, rippled, onSelect, onOpenProblem, onDrop, onTaskDragStart, onTaskDragEnd }: BoardColumnProps) {
  const [isOver, setIsOver] = useState(false);
  const meta = column.kind === "problem" ? `#${column.rank} · ${column.score}` : column.kind === "unsorted" ? "Needs review" : "Not feedback";

  return (
    <section
      aria-label={`${column.title}, ${column.total ?? column.reports.length} reports`}
      className={cn(
        "flex flex-col w-72 min-w-72 rounded-lg border border-border backdrop-blur-sm transition-all duration-300 min-h-0",
        isOver ? "column-highlight border-muted/50" : "bg-card/50",
        column.kind === "internal" && !isOver && "opacity-70",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        setIsOver(false);
        onDrop(e, column.id);
      }}
    >
      <div className="p-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("h-3 w-3 rounded-full flex-shrink-0", column.kind === "unsorted" ? "bg-muted-foreground/60" : "bg-muted")} />
          {onOpenProblem && column.kind !== "unsorted" ? (
            <button
              type="button"
              onClick={() => onOpenProblem(column.id)}
              className="font-medium text-sm text-foreground truncate text-left hover:underline underline-offset-2"
              title={`${column.title}: open brief and evidence`}
            >
              {column.title}
            </button>
          ) : (
            <h4 className="font-medium text-sm text-foreground truncate" title={column.title}>
              {column.title}
            </h4>
          )}
          <span className="text-xs bg-muted/50 px-2 py-0.5 rounded-full text-muted-foreground flex-shrink-0">{column.total ?? column.reports.length}</span>
        </div>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{meta}</span>
      </div>

      <div className="p-2 flex-1 space-y-2 overflow-auto min-h-0">
        {column.reports.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            selected={selected.has(report.id)}
            rippled={rippled?.has(report.id) ?? false}
            onSelect={onSelect}
            onDragStart={onTaskDragStart}
            onDragEnd={onTaskDragEnd}
          />
        ))}
        {column.reports.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Drop a report here</p>
        )}
      </div>
    </section>
  );
}
