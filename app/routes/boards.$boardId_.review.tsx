import { useState } from "react";
import { useParams } from "react-router";

import { GsShell } from "@/components/groundswell/GsShell";
import { Review } from "@/components/groundswell/Review";

export function meta() {
  return [{ title: "Review · Groundswell" }];
}

export default function ReviewRoute() {
  const { boardId = "" } = useParams();
  const [search, setSearch] = useState("");
  return (
    <GsShell boardId={boardId} search={search} onSearch={setSearch}>
      <Review boardId={boardId} search={search} />
    </GsShell>
  );
}
