import { useState } from "react";
import { useParams } from "react-router";

import { Briefs } from "@/components/groundswell/Briefs";
import { GsShell } from "@/components/groundswell/GsShell";

export function meta() {
  return [{ title: "Briefs · Groundswell" }];
}

export default function BriefsRoute() {
  const { boardId = "" } = useParams();
  const [search, setSearch] = useState("");
  return (
    <GsShell boardId={boardId} search={search} onSearch={setSearch}>
      <Briefs boardId={boardId} search={search} />
    </GsShell>
  );
}
