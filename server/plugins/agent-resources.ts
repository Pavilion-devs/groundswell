import { ensureResourceStoreReady, resourceGetByPath, resourcePut, SHARED_OWNER } from "@agent-native/core/resources/store";

import { FEEDBACK_SYNTHESIS_SKILL } from "../agent-resources/feedback-synthesis.js";
import { THEME_SORTER_AGENT } from "../agent-resources/theme-sorter.js";

/**
 * Ship Groundswell's agent know-how as shared agent resources, so every user's
 * agent has them and they show up (editable) in the Resources tab:
 * - skills/feedback-synthesis/SKILL.md: how to draft a codebook and run a sort
 * - agents/theme-sorter.md: the sub-agent profile spawned once per slice
 *
 * The repo copy is the source of truth: a boot rewrites a resource only when
 * its content differs from what ships.
 */
const SHIPPED: Array<{ path: string; content: string }> = [
  { path: "skills/feedback-synthesis/SKILL.md", content: FEEDBACK_SYNTHESIS_SKILL },
  { path: "agents/theme-sorter.md", content: THEME_SORTER_AGENT },
];

export default async (_nitroApp: unknown): Promise<void> => {
  try {
    await ensureResourceStoreReady();
    for (const { path, content } of SHIPPED) {
      const current = await resourceGetByPath(SHARED_OWNER, path);
      if (current?.content === content) continue;
      await resourcePut(SHARED_OWNER, path, content, "text/markdown", {
        metadata: { managedBy: "groundswell", note: "Shipped with the app; edits are replaced on the next deploy." },
      });
    }
  } catch (err) {
    console.warn("[groundswell] could not install shared agent resources:", err instanceof Error ? err.message : err);
  }
};
