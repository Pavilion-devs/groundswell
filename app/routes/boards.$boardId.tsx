import { useCallback, useState } from "react";
import { useParams } from "react-router";

import { Board } from "@/components/groundswell/Board";
import { GsShell } from "@/components/groundswell/GsShell";

export function meta() {
  return [{ title: "Board · Groundswell" }];
}

export default function BoardRoute() {
  const { boardId = "" } = useParams();
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<{ notes: number; problems: number; unsorted: number } | null>(null);
  const onCounts = useCallback((c: { notes: number; problems: number; unsorted: number }) => setCounts(c), []);
  return (
    <GsShell
      boardId={boardId}
      search={search}
      onSearch={setSearch}
      {...(counts ? { noteCount: counts.notes, problemCount: counts.problems, reviewCount: counts.unsorted } : {})}
    >
      <Board boardId={boardId} search={search} onCounts={onCounts} />
    </GsShell>
  );
}
