import type { AiResult, Booking, DeterministicRisk, WeatherSummary } from "@/lib/types";
import { generateMockRecommendation } from "@/lib/ai/mock";
import { parseAiResponse } from "@/lib/ai/schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/ai/prompt";

/**
 * AI adapter for any OpenAI-compatible /chat/completions endpoint
 * (Qwen Cloud / DashScope compatible-mode, OpenAI, Groq, local vLLM, ...).
 *
 * SERVER ONLY. The API key is read from process.env and must never be prefixed
 * with NEXT_PUBLIC_. This module is imported exclusively from route handlers.
 * A runtime guard below hard-fails if it is ever bundled into the browser.
 *
 * Fallback policy — the UI always gets a usable recommendation:
 *   no API key      -> mock
 *   network error   -> mock
 *   non-2xx         -> mock
 *   unparseable/invalid JSON -> mock
 */

const DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus";
const REQUEST_TIMEOUT_MS = 20000;

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Returns null when no API key is configured (→ mock mode). */
export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig | null {
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env.AI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: env.AI_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export function isAiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readAiConfig(env) !== null;
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "ai/adapter.ts must never run in the browser — the API key is server-side only.",
    );
  }
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  model?: string;
}

/**
 * Get an AI recommendation. NEVER throws — always returns a usable result,
 * falling back to the mock adapter with a `fallbackReason` on any problem.
 */
export async function getAiRecommendation(
  booking: Booking,
  weather: WeatherSummary,
  deterministic: DeterministicRisk,
  opts: { config?: AiConfig | null } = {},
): Promise<AiResult> {
  assertServerOnly();

  const mock = (fallbackReason?: string): AiResult => ({
    recommendation: generateMockRecommendation(booking, weather, deterministic),
    source: "mock",
    fallbackReason,
  });

  const config = opts.config !== undefined ? opts.config : readAiConfig();
  if (!config) {
    return mock("AI_API_KEY が未設定のため mock adapter を使用しました");
  }

  const startedAt = Date.now();

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(booking, weather, deterministic) },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      // Body is intentionally not surfaced — provider errors can echo the key.
      return mock(`AI provider が HTTP ${res.status} を返したため mock にフォールバックしました`);
    }

    const json = (await res.json()) as ChatCompletionResponse;
    const content = json.choices?.[0]?.message?.content;

    if (typeof content !== "string" || content.trim() === "") {
      return mock("AI provider の応答が空だったため mock にフォールバックしました");
    }

    const parsed = parseAiResponse(content);
    if (!parsed.ok || !parsed.data) {
      return mock(`${parsed.error ?? "AI応答が不正です"} — mock にフォールバックしました`);
    }

    return {
      recommendation: parsed.data,
      source: "live",
      model: json.model ?? config.model,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return mock(`AI provider への接続に失敗しました (${message}) — mock を使用しました`);
  }
}
