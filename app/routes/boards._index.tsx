import { useActionQuery } from "@agent-native/core/client/hooks";
import { Navigate } from "react-router";

export function meta() {
  return [{ title: "Boards · Groundswell" }];
}

/** /boards opens the most recently updated board. */
export default function BoardsIndex() {
  const { data, isLoading } = useActionQuery("list-boards", {});
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading boards...</div>;
  const first = data?.boards[0];
  if (!first) return <div className="p-6 text-sm text-muted-foreground">No boards yet. Ask the agent to import feedback.</div>;
  return <Navigate to={`/boards/${first.id}`} replace />;
}
