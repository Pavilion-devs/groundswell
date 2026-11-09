import { useState } from "react";
import { useParams } from "react-router";

import { Sources } from "@/components/groundswell/Sources";
import { GsShell } from "@/components/groundswell/GsShell";

export function meta() {
  return [{ title: "Sources · Groundswell" }];
}

export default function SourcesRoute() {
  const { boardId = "" } = useParams();
  const [search, setSearch] = useState("");
  return (
    <GsShell boardId={boardId} search={search} onSearch={setSearch}>
      <Sources boardId={boardId} search={search} />
    </GsShell>
  );
}
