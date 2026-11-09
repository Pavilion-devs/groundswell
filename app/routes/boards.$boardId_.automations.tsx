import { useState } from "react";
import { useParams } from "react-router";

import { Automations } from "@/components/groundswell/Automations";
import { GsShell } from "@/components/groundswell/GsShell";

export function meta() {
  return [{ title: "Automations · Groundswell" }];
}

export default function AutomationsRoute() {
  const { boardId = "" } = useParams();
  const [search, setSearch] = useState("");
  return (
    <GsShell boardId={boardId} search={search} onSearch={setSearch}>
      <Automations boardId={boardId} search={search} />
    </GsShell>
  );
}
