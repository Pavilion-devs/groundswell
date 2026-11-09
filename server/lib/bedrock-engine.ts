import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { createAISDKEngine, registerAgentEngine } from "@agent-native/core/agent/engine";
import { defineAppConfig } from "@agent-native/core/app-config";

import { BEDROCK_MODELS, BEDROCK_REGION } from "./models.js";

/**
 * Claude on Amazon Bedrock as the agent engine.
 *
 * The framework has no Bedrock provider, but its Anthropic engine (AI SDK)
 * takes a custom `fetch`. Every Messages API call it makes to BEDROCK_BASE_URL
 * is handed to Anthropic's Bedrock SDK, which signs it with AWS credentials and
 * streams Bedrock's response back as the Anthropic event stream the engine
 * expects. Nothing else is reachable through this fetch.
 *
 * Credentials come from the AWS SDK's default chain: locally the AWS CLI login
 * session (`aws login`), in production the deployment's AWS role or keys. No
 * key is stored by the app. Region: BEDROCK_REGION in models.ts.
 */
export const BEDROCK_ENGINE_NAME = "bedrock";
/** Placeholder origin the engine "calls"; requests never leave for it. */
const BEDROCK_BASE_URL = "https://bedrock.groundswell.invalid/v1";
const NO_API_KEY = "aws-credentials";

let client: AnthropicBedrock | null = null;
function bedrock(): AnthropicBedrock {
  client ??= new AnthropicBedrock({ awsRegion: BEDROCK_REGION });
  return client;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function errorResponse(err: unknown): Response {
  const e = err as { status?: number; error?: unknown; message?: string; name?: string };
  const status = typeof e.status === "number" ? e.status : 502;
  const inner = (e.error as { error?: { type?: string; message?: string }; message?: string } | undefined) ?? undefined;
  const message = inner?.error?.message ?? inner?.message ?? e.message ?? "Bedrock request failed";
  const type = inner?.error?.type ?? (status === 403 ? "permission_error" : status === 429 ? "rate_limit_error" : "api_error");
  // Expired AWS sessions surface as credential errors from the SDK chain.
  const credential = /credential|expired|token/i.test(`${e.name ?? ""} ${message}`) && status === 502;
  return jsonResponse({ type: "error", error: { type: credential ? "authentication_error" : type, message: credential ? `AWS credentials unavailable for Bedrock: ${message}. Run \`aws login\` again.` : message } }, credential ? 401 : status);
}

async function bedrockFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(`${BEDROCK_BASE_URL}/messages`) || (init?.method ?? "GET").toUpperCase() !== "POST") {
    return jsonResponse({ type: "error", error: { type: "not_found_error", message: `The Bedrock engine only serves Messages calls, not ${url}` } }, 404);
  }
  const body = JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as ArrayBuffer));
  const beta = new Headers(init?.headers).get("anthropic-beta");
  const options = { ...(init?.signal ? { signal: init.signal } : {}), ...(beta ? { headers: { "anthropic-beta": beta } } : {}) };
  try {
    if (!body.stream) {
      const message = await bedrock().messages.create({ ...body, stream: false }, options);
      return jsonResponse(message);
    }
    const stream = (await bedrock().messages.create({ ...body, stream: true }, options)) as unknown as AsyncIterable<{ type: string }> & {
      controller: AbortController;
    };
    const encoder = new TextEncoder();
    const sse = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
          }
        } catch (err) {
          const res = errorResponse(err);
          controller.enqueue(encoder.encode(`event: error\ndata: ${await res.text()}\n\n`));
        } finally {
          controller.close();
        }
      },
      cancel() {
        stream.controller.abort();
      },
    });
    return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
  } catch (err) {
    return errorResponse(err);
  }
}

registerAgentEngine({
  name: BEDROCK_ENGINE_NAME,
  label: "Claude on Amazon Bedrock",
  description: "Claude Sonnet 4.6 through Amazon Bedrock, signed with the server's AWS credentials.",
  capabilities: { thinking: false, promptCaching: true, vision: true, computerUse: false, parallelToolCalls: true },
  defaultModel: BEDROCK_MODELS.default,
  supportedModels: [BEDROCK_MODELS.default, ...BEDROCK_MODELS.others],
  acceptsCustomModels: true,
  requiredEnvVars: [],
  create: (config) =>
    createAISDKEngine("anthropic", {
      ...config,
      name: BEDROCK_ENGINE_NAME,
      label: "Claude on Amazon Bedrock",
      model: typeof config.model === "string" && config.model ? config.model : BEDROCK_MODELS.default,
      supportedModels: [BEDROCK_MODELS.default, ...BEDROCK_MODELS.others],
      acceptsCustomModels: true,
      apiKey: NO_API_KEY,
      allowEnvFallback: false,
      baseUrl: BEDROCK_BASE_URL,
      requestFetch: bedrockFetch,
      // AWS signs each request; a failed call must not mark a stored key as broken.
      skipCredentialFailureTracking: true,
    }),
});

/**
 * Bedrock runs every agent turn: chat in the browser, sorter sub-agents and
 * background automations (webhooks, schedules) all resolve their engine from
 * this runtime config. To go back to Meta, set engine to "meta" (meta-engine.ts).
 */
defineAppConfig({ agent: { engine: BEDROCK_ENGINE_NAME, model: BEDROCK_MODELS.default } });
