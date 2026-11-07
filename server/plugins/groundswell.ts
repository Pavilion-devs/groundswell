// Load Groundswell's registrations at boot: the shareable "board" resource
// (server/db/index.ts) and the optional GitHub token (server/lib/secrets.ts).
import "../db/index.js";
import "../lib/secrets.js";

export default async (_nitroApp: unknown): Promise<void> => {};
