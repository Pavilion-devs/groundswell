import { createAISDKEngine, registerAgentEngine } from "@agent-native/core/agent/engine";

import { META_MODELS } from "./models.js";

/**
 * Meta Model API (Muse Spark) as an agent engine.
 *
 * Meta's API is OpenAI-compatible at https://api.meta.ai/v1, so this reuses the
 * framework's AI SDK OpenAI engine with Meta's endpoint. A custom base URL makes
 * the engine use Chat Completions for tool calls, which Meta supports.
 * The key comes from META_API_KEY (env or the app's secret store), resolved by
 * the framework through `requiredEnvVars`; it is never read from config files.
 */
export const META_ENGINE_NAME = "meta";
export const META_BASE_URL = "https://api.meta.ai/v1";

registerAgentEngine({
  name: META_ENGINE_NAME,
  label: "Meta Muse",
  description: "Meta Muse Spark models via the Meta Model API (OpenAI-compatible). Requires META_API_KEY.",
  capabilities: { thinking: false, promptCaching: false, vision: false, computerUse: false, parallelToolCalls: true },
  defaultModel: META_MODELS.default,
  supportedModels: [META_MODELS.default, ...META_MODELS.others],
  acceptsCustomModels: true,
  requiredEnvVars: ["META_API_KEY"],
  create: (config) =>
    createAISDKEngine("openai", {
      ...config,
      name: META_ENGINE_NAME,
      label: "Meta Muse",
      model: typeof config.model === "string" && config.model ? config.model : META_MODELS.default,
      supportedModels: [META_MODELS.default, ...META_MODELS.others],
      acceptsCustomModels: true,
      // Resolved by the framework from META_API_KEY via requiredEnvVars.
      apiKey: typeof config.apiKey === "string" && config.apiKey ? config.apiKey : undefined,
      allowEnvFallback: false,
      baseUrl: META_BASE_URL,
    }),
});
