/**
 * One report on the board. Ported from Twisky's TaskCard: same structure,
 * classes and drag behaviour; the content is a real report and its verified quote.
 */
import { MessageSquare, Pin } from "lucide-react";
import React, { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface Report {
  id: string;
  title: string;
  quote: string | null;
  excerpt: string;
  author: string | null;
  url: string | null;
  labels: string[];
  comments: number;
  reactions: number;
  createdAt: string | null;
  pinned: boolean;
  confidence: number | null;
  themeId: string | null;
  suggestion: string | null;
}

interface ReportCardProps {
  report: Report;
  selected: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onDragStart: (e: React.DragEvent, report: Report) => void;
  onDragEnd: () => void;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 31) return `${Math.floor(days / 7)} wk ago`;
  const months = Math.floor(days / 30.4);
  return months < 12 ? `${months} mo ago` : `${Math.floor(months / 12)} yr ago`;
}

export function ReportCard({ report, selected, onSelect, onDragStart, onDragEnd }: ReportCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    // Twisky's ghost image: a translucent copy of the card follows the pointer.
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const ghost = cardRef.current.cloneNode(true) as HTMLDivElement;
      ghost.style.position = "absolute";
      ghost.style.top = "-1000px";
      ghost.style.width = `${rect.width}px`;
      ghost.style.opacity = "0.8";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);
      setTimeout(() => document.body.removeChild(ghost), 0);
    }
    onDragStart(e, report);
  };

  const tag = report.pinned ? "Placed by you" : (report.labels[0] ?? "GitHub");
  const body = report.quote ? `“${report.quote}”` : report.excerpt;

  return (
    <div
      ref={cardRef}
      draggable
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${report.title}. ${selected ? "Selected." : ""} Drag to another problem to move it.`}
      onDragStart={handleDragStart}
      onDragEnd={() => {
        setIsDragging(false);
        onDragEnd();
      }}
      onClick={(e) => onSelect(report.id, e.metaKey || e.ctrlKey || e.shiftKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(report.id, e.metaKey || e.ctrlKey || e.shiftKey);
        }
      }}
      className={cn(
        "task-card p-4 bg-card rounded-md border border-border shadow-sm hover:shadow-md transition-all duration-200 h-48 flex flex-col cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "dragging",
        selected && "ring-2 ring-primary",
      )}
    >
      <div className="flex justify-between items-start mb-3 flex-shrink-0 gap-2">
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-muted/50 text-muted-foreground border border-border flex items-center gap-1 truncate max-w-[70%]">
          {report.pinned && <Pin className="h-3 w-3 flex-shrink-0" aria-hidden="true" />}
          <span className="truncate">{tag}</span>
        </span>
        <span className="text-muted-foreground text-xs whitespace-nowrap">{timeAgo(report.createdAt)}</span>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 mb-3 min-h-0 overflow-hidden">
          <h5 className="font-medium mb-2 text-foreground text-sm leading-tight line-clamp-2">{report.title}</h5>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{body}</p>
        </div>

        <div className="flex justify-between items-center flex-shrink-0 mt-auto gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[10px] font-semibold text-muted-foreground flex-shrink-0">
              {(report.author ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <span className="text-xs text-muted-foreground truncate">{report.suggestion ? `maybe ${report.suggestion}` : (report.author ?? "")}</span>
          </div>
          <span className="flex items-center gap-1 text-muted-foreground text-xs flex-shrink-0">
            <MessageSquare className="h-3 w-3" aria-hidden="true" />
            {report.comments}
          </span>
        </div>
      </div>
    </div>
  );
}
