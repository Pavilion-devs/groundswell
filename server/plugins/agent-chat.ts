import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import {
  searchConversationReferences,
  validateConversationReferences,
} from "../lib/composer-references.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "list-boards",
  "get-board",
  "create-board",
  "add-github-source",
  "import-csv",
  "import-text",
  "list-notes",
  "get-note",
  "get-run-status",
  "provider-api-request",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "groundswell",
  mentionProviders: {
    chats: {
      label: "composerSources.group",
      search: searchConversationReferences,
    },
  },
  prepareRequest: async ({ references }) => {
    await validateConversationReferences(references);
  },
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are Groundswell's agent. Groundswell turns raw feedback (GitHub issues, CSV exports, pasted notes) into a board of themes that the user and you shape together, then turns the top problems into evidence-backed issues.

How to work:
- Everything goes through actions. A board holds sources, notes (one piece of feedback each), themes and placements. Start with list-boards or get-board, or view-screen when the user refers to what they are looking at.
- To bring feedback in: add-github-source for a repo ("owner/name"), import-csv for spreadsheet exports, import-text for pasted notes. Report the counts the action returns, including skipped bot issues or truncation.
- To read feedback: list-notes (filters: source, theme, unsorted, search) and get-note for the full text.
- Never invent feedback, quotes, counts or users. Quote only text you read from a note, and take numbers from action results.
- The user's own placements are final. Never move a note the user placed.
- Be brief. Lead with what changed or what you found, then the next useful step.`,
});
