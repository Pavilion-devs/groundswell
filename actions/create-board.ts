import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { getRequestOrgId, getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { newId, nowIso } from "../server/lib/ids.js";

const errors = defineActionErrors("not_signed_in");

export default defineAction({
  description:
    "Create a new feedback board. A board holds sources (GitHub repos, CSVs, pasted text), the notes imported from them, and the themes they are sorted into. Returns the new board id; add a source next with add-github-source, import-csv or import-text.",
  schema: z.object({
    title: z.string().trim().min(1).max(120).describe("Board title, e.g. \"Agent-Native user feedback\""),
    description: z.string().trim().max(1000).optional().describe("Optional one-paragraph description of what this board is for"),
  }),
  outputSchema: z.object({ id: z.string(), title: z.string(), message: z.string() }),
  errors,
  mcpAnnotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  run: async ({ title, description }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) return errors.noWrite("Sign in to create a board.", "not_signed_in", { statusCode: 401 });
    const id = newId("brd");
    const now = nowIso();
    await getDb()
      .insert(schema.boards)
      .values({ id, title, description: description ?? null, createdAt: now, updatedAt: now, ownerEmail, orgId: getRequestOrgId() ?? null });
    return { id, title, message: `Created board "${title}".` };
  },
});
