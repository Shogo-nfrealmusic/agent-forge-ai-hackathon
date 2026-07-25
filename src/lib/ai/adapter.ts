import type { AiResult, Booking, DeterministicRisk, WeatherSummary } from "@/lib/types";
import { generateMockRecommendation } from "@/lib/ai/mock";
import { parseAiResponse } from "@/lib/ai/schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/ai/prompt";
import { readAiProviders, readQwenConfig, type AiProviderConfig } from "@/lib/ai/providers";

/**
 * AI adapter for any OpenAI-compatible /chat/completions endpoint.
 *
 * SERVER ONLY. API keys are read from process.env and must never be prefixed
 * with NEXT_PUBLIC_. This module is imported exclusively from route handlers.
 * A runtime guard below hard-fails if it is ever bundled into the browser.
 *
 * Provider chain (see ai/providers.ts): Qwen Cloud → GMI Cloud → mock.
 * The UI always gets a usable recommendation:
 *   no provider configured     -> mock
 *   network error / non-2xx    -> next provider, then mock
 *   unparseable/invalid JSON   -> next provider, then mock
 */

const REQUEST_TIMEOUT_MS = 20000;

export type AiConfig = AiProviderConfig;

/** Back-compat helper: the primary provider only. */
export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiProviderConfig | null {
  return readQwenConfig(env);
}

export function isAiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readAiProviders(env).length > 0;
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "ai/adapter.ts must never run in the browser — API keys are server-side only.",
    );
  }
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  model?: string;
}

/**
 * Low-level call to one OpenAI-compatible provider. Returns the raw completion
 * text, or throws with a message that is safe to show (never the response body,
 * which some providers use to echo the credential back).
 */
export async function callChatCompletion(
  config: AiProviderConfig,
  messages: { role: "system" | "user"; content: string }[],
  opts: { jsonMode?: boolean; temperature?: number; timeoutMs?: number } = {},
): Promise<{ content: string; model?: string }> {
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: opts.temperature ?? 0.2,
    messages,
  };
  if (opts.jsonMode !== false) body.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach ${config.label} (${message})`);
  }

  if (!res.ok) {
    throw new Error(`${config.label} returned HTTP ${res.status}`);
  }

  const json = (await res.json()) as ChatCompletionResponse;
  const content = json.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim() === "") {
    throw new Error(`${config.label} returned an empty response`);
  }

  return { content, model: json.model ?? config.model };
}

/**
 * Get an AI recommendation. NEVER throws — always returns a usable result,
 * walking the provider chain and finally falling back to the mock adapter.
 */
export async function getAiRecommendation(
  booking: Booking,
  weather: WeatherSummary,
  deterministic: DeterministicRisk,
  opts: { config?: AiConfig | null; providers?: AiProviderConfig[] } = {},
): Promise<AiResult> {
  assertServerOnly();

  const mock = (fallbackReason?: string): AiResult => ({
    recommendation: generateMockRecommendation(booking, weather, deterministic),
    source: "mock",
    fallbackReason,
  });

  // `config` (singular) keeps the original single-provider call shape working.
  const providers: AiProviderConfig[] =
    opts.providers ??
    (opts.config !== undefined ? (opts.config ? [opts.config] : []) : readAiProviders());

  if (providers.length === 0) {
    return mock("No AI provider is configured (AI_API_KEY / GMI_API_KEY), so the mock adapter was used");
  }

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildUserPrompt(booking, weather, deterministic) },
  ];

  const failures: string[] = [];

  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const { content, model } = await callChatCompletion(provider, messages);
      const parsed = parseAiResponse(content);

      if (!parsed.ok || !parsed.data) {
        failures.push(`${provider.label}: ${parsed.error ?? "invalid response"}`);
        continue;
      }

      return {
        recommendation: parsed.data,
        source: "live",
        provider: provider.id,
        model,
        latencyMs: Date.now() - startedAt,
        fallbackReason: failures.length > 0 ? `Failed over from ${failures.join("; ")}` : undefined,
      };
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }

  return mock(`${failures.join("; ")} - the mock adapter was used instead`);
}
