import { defineAgentNativeConfig } from "@agent-native/core/config";

export default defineAgentNativeConfig({
  changelog: { enabled: false },
  harness: true,
  // Meta Muse Spark via the Meta Model API; registered in server/lib/meta-engine.ts.
  agent: { engine: "meta", model: "muse-spark-1.3" },
});
