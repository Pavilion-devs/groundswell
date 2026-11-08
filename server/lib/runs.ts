import { defineMachine } from "@agent-native/core/state-machine";
import { and, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Board } from "./boards.js";
import { tenantOf } from "./boards.js";
import { newId, nowIso } from "./ids.js";

/** Lifecycle of long-running work (imports, classification, re-sorts...). */
export const runMachine = defineMachine({
  id: "groundswell-run",
  states: ["queued", "running", "succeeded", "failed", "cancelled"],
  initial: "queued",
  terminal: ["succeeded", "failed", "cancelled"],
  transitions: {
    start: { from: ["queued"], to: "running" },
    succeed: { from: ["running"], to: "succeeded" },
    fail: { from: ["queued", "running"], to: "failed" },
    cancel: { from: ["queued", "running"], to: "cancelled" },
  },
});

export type RunKind = (typeof schema.runs.$inferSelect)["kind"];
export type Run = typeof schema.runs.$inferSelect;

/** Create a run already in `running` (work starts immediately in this request). */
export async function startRun(board: Board, kind: RunKind, meta: Record<string, unknown> = {}, total?: number): Promise<string> {
  const id = newId("run");
  const now = nowIso();
  await getDb().insert(schema.runs).values({
    id,
    boardId: board.id,
    kind,
    status: runMachine.transition("queued", "start"),
    progress: 0,
    total: total ?? null,
    meta,
    startedAt: now,
    createdAt: now,
    ...tenantOf(board),
  });
  return id;
}

export async function setRunProgress(runId: string, progress: number, total?: number | null): Promise<void> {
  await getDb()
    .update(schema.runs)
    .set({ progress, ...(total !== undefined ? { total } : {}) })
    .where(and(eq(schema.runs.id, runId), eq(schema.runs.status, "running")));
}

/** Compare-and-set transition; zero rows means the run already ended. */
async function endRun(runId: string, event: "succeed" | "fail" | "cancel", patch: Partial<Run>): Promise<boolean> {
  const rows = await getDb()
    .update(schema.runs)
    .set({ ...patch, status: runMachine.transition("running", event), finishedAt: nowIso() })
    .where(and(eq(schema.runs.id, runId), inArray(schema.runs.status, [...runMachine.fromStates(event)])))
    .returning({ id: schema.runs.id });
  return rows.length === 1;
}

export function succeedRun(runId: string, meta?: Record<string, unknown>): Promise<boolean> {
  return endRun(runId, "succeed", meta ? { meta } : {});
}

export function failRun(runId: string, error: string): Promise<boolean> {
  return endRun(runId, "fail", { error: error.slice(0, 2000) });
}

export function cancelRun(runId: string, reason: string): Promise<boolean> {
  return endRun(runId, "cancel", { error: reason.slice(0, 2000) });
}
