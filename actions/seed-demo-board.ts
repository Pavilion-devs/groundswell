import { defineAction } from "@agent-native/core/action";
import { getRequestOrgId, getRequestUserEmail } from "@agent-native/core/server/request-context";
import { accessFilter } from "@agent-native/core/sharing";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { newId, nowIso } from "../server/lib/ids.js";
import addGithubSource from "./add-github-source.js";

export const DEMO_BOARD = {
  title: "Agent-Native user feedback",
  description: "What people building with Agent-Native ask for, from the framework's public GitHub issues.",
  repo: "BuilderIO/agent-native",
};

/**
 * Developer/demo setup: create (or reuse) the headline demo board for the
 * signed-in user and import the real BuilderIO/agent-native issues onto it.
 * Safe to re-run. Hidden from the agent: `pnpm action seed-demo-board`.
 */
export default defineAction({
  description: "Create or refresh the demo board with the public BuilderIO/agent-native GitHub issues (developer setup).",
  schema: z.object({}),
  outputSchema: z.object({ boardId: z.string(), created: z.boolean(), message: z.string() }),
  agentTool: false,
  http: false,
  run: async () => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) throw new Error("Sign in (or set AGENT_USER_EMAIL) before seeding.");
    const db = getDb();
    const [existing] = await db
      .select({ id: schema.boards.id })
      .from(schema.boards)
      .where(and(accessFilter(schema.boards, schema.boardShares), eq(schema.boards.title, DEMO_BOARD.title)))
      .limit(1);
    let boardId = existing?.id;
    if (!boardId) {
      boardId = newId("brd");
      const now = nowIso();
      await db.insert(schema.boards).values({
        id: boardId,
        title: DEMO_BOARD.title,
        description: DEMO_BOARD.description,
        createdAt: now,
        updatedAt: now,
        ownerEmail,
        orgId: getRequestOrgId() ?? null,
      });
    }
    const result = await addGithubSource.run({ boardId, repo: DEMO_BOARD.repo, state: "all", maxIssues: 2000, excludeBots: true });
    return { boardId, created: !existing, message: `${existing ? "Refreshed" : "Created"} the demo board. ${result.message}` };
  },
});
