import { createGetDb } from "@agent-native/core/db";
import { registerShareableResource } from "@agent-native/core/sharing";

import * as schema from "./schema.js";

export const getDb = createGetDb(schema);
export { schema };

/** Boards are the shareable resource; children inherit access from their board. */
registerShareableResource({
  type: "board",
  agentRead: { actions: ["get-board"] },
  resourceTable: schema.boards,
  sharesTable: schema.boardShares,
  displayName: "Board",
  titleColumn: "title",
  getResourcePath: (board) => `/boards/${board.id}`,
  getDb,
});
