import { createAISDKEngine, registerAgentEngine } from "@agent-native/core/agent/engine";
import { registerRequiredSecret } from "@agent-native/core/secrets";
import { resolveSecretDetailed } from "@agent-native/core/server";

import { META_MODELS } from "./models.js";

/**
 * Meta Model API (Muse Spark) as an agent engine.
 *
 * Meta's API is OpenAI-compatible at https://api.meta.ai/v1, so this reuses the
 * framework's AI SDK OpenAI engine with Meta's endpoint. A custom base URL makes
 * the engine use Chat Completions for tool calls, which Meta supports.
 *
 * The key is META_API_KEY from the app's secret store (falling back to the
 * deployment env value). The chat path builds engines without a resolved key,
 * so the key is looked up per request inside `requestFetch` and set as the
 * Authorization header; it never lives in config or on the engine object.
 */
export const META_ENGINE_NAME = "meta";
export const META_BASE_URL = "https://api.meta.ai/v1";
export const META_API_KEY = "META_API_KEY";

/** Stands in for the key so the engine does not refuse to start; replaced per request. */
const KEY_RESOLVED_PER_REQUEST = "resolved-per-request";

registerRequiredSecret({
  key: META_API_KEY,
  label: "Meta Model API key",
  description: "Runs Groundswell's agent on Meta Muse Spark through the Meta Model API.",
  docsUrl: "https://dev.meta.ai/docs/quickstart",
  scope: "user",
  kind: "api-key",
  required: false,
  usedFor: [{ appId: "groundswell", feature: "Agent chat and sorting", effectWhenRemoved: "The Meta engine cannot reach the model." }],
});

export class MetaKeyMissingError extends Error {}

async function metaFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(`${META_BASE_URL}/`)) throw new Error("The Meta engine only calls the Meta Model API.");
  const detail = await resolveSecretDetailed(META_API_KEY);
  // A lookup can report a store failure and still return the deployment value
  // (e.g. sub-agent runs on a trusted self-hosted runtime); a value wins.
  if (!detail.value) {
    throw new MetaKeyMissingError(
      detail.lookupFailed
        ? "Could not read the saved Meta API key. Try again in a moment."
        : "No Meta API key is set. Add META_API_KEY to use the Meta engine.",
    );
  }
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${detail.value}`);
  return fetch(input, { ...init, headers });
}

registerAgentEngine({
  name: META_ENGINE_NAME,
  label: "Meta Muse",
  description: "Meta Muse Spark models via the Meta Model API (OpenAI-compatible). Requires META_API_KEY.",
  capabilities: { thinking: false, promptCaching: false, vision: false, computerUse: false, parallelToolCalls: true },
  defaultModel: META_MODELS.default,
  supportedModels: [META_MODELS.default, ...META_MODELS.others],
  acceptsCustomModels: true,
  requiredEnvVars: [META_API_KEY],
  create: (config) =>
    createAISDKEngine("openai", {
      ...config,
      name: META_ENGINE_NAME,
      label: "Meta Muse",
      model: typeof config.model === "string" && config.model ? config.model : META_MODELS.default,
      supportedModels: [META_MODELS.default, ...META_MODELS.others],
      acceptsCustomModels: true,
      apiKey: KEY_RESOLVED_PER_REQUEST,
      allowEnvFallback: false,
      baseUrl: META_BASE_URL,
      requestFetch: metaFetch,
      // Our fetch owns the credential, so a failed call must not mark a stored key as broken.
      skipCredentialFailureTracking: true,
    }),
});

// The active engine is chosen in bedrock-engine.ts (defineAppConfig). Meta stays
// registered as an alternative: set engine to META_ENGINE_NAME there to use it.
