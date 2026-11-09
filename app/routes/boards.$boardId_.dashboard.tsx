import { useState } from "react";
import { useParams } from "react-router";

import { Dashboard } from "@/components/groundswell/Dashboard";
import { GsShell } from "@/components/groundswell/GsShell";

export function meta() {
  return [{ title: "Dashboard · Groundswell" }];
}

export default function DashboardRoute() {
  const { boardId = "" } = useParams();
  const [search, setSearch] = useState("");
  return (
    <GsShell boardId={boardId} search={search} onSearch={setSearch}>
      <Dashboard boardId={boardId} search={search} />
    </GsShell>
  );
}
