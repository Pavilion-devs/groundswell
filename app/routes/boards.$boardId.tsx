import { useState } from "react";
import { useParams } from "react-router";

import { Board } from "@/components/groundswell/Board";
import { GsShell } from "@/components/groundswell/GsShell";

export function meta() {
  return [{ title: "Board · Groundswell" }];
}

export default function BoardRoute() {
  const { boardId = "" } = useParams();
  const [search, setSearch] = useState("");
  return (
    <GsShell boardId={boardId} search={search} onSearch={setSearch}>
      <Board boardId={boardId} search={search} />
    </GsShell>
  );
}
