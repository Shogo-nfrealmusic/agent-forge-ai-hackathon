/**
 * AI provider chain (SERVER ONLY).
 *
 * Every provider here speaks the OpenAI-compatible /chat/completions protocol,
 * so one adapter drives all of them. They are tried in order and the first one
 * that returns a schema-valid response wins; if all of them fail the mock
 * adapter takes over. That means a dead provider degrades the demo instead of
 * ending it.
 *
 *   1. Qwen Cloud  (DashScope international, OpenAI-compatible mode)
 *   2. GMI Cloud   (https://api.gmi-serving.com/v1)
 *
 * Credentials are read from process.env only and must never carry a
 * NEXT_PUBLIC_ prefix.
 */

export interface AiProviderConfig {
  /** Stable id used in the UI and the audit log. Never contains a secret. */
  id: "qwen-cloud" | "gmi-cloud";
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const QWEN_DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const QWEN_DEFAULT_MODEL = "qwen-plus";

const GMI_DEFAULT_BASE_URL = "https://api.gmi-serving.com/v1";
const GMI_DEFAULT_MODEL = "Qwen/Qwen3-235B-A22B-Instruct-2507";

function trimUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Primary provider: Qwen Cloud (or any OpenAI-compatible endpoint via AI_BASE_URL). */
export function readQwenConfig(env: NodeJS.ProcessEnv = process.env): AiProviderConfig | null {
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    id: "qwen-cloud",
    label: "Qwen Cloud",
    apiKey,
    baseUrl: trimUrl(env.AI_BASE_URL?.trim() || QWEN_DEFAULT_BASE_URL),
    model: env.AI_MODEL?.trim() || QWEN_DEFAULT_MODEL,
  };
}

/** Failover provider: GMI Cloud. */
export function readGmiConfig(env: NodeJS.ProcessEnv = process.env): AiProviderConfig | null {
  const apiKey = env.GMI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    id: "gmi-cloud",
    label: "GMI Cloud",
    apiKey,
    baseUrl: trimUrl(env.GMI_BASE_URL?.trim() || GMI_DEFAULT_BASE_URL),
    model: env.GMI_MODEL?.trim() || GMI_DEFAULT_MODEL,
  };
}

/** Ordered provider chain. Empty when nothing is configured (→ mock only). */
export function readAiProviders(env: NodeJS.ProcessEnv = process.env): AiProviderConfig[] {
  return [readQwenConfig(env), readGmiConfig(env)].filter(
    (c): c is AiProviderConfig => c !== null,
  );
}

/** Capability report for the UI. Never contains a key. */
export function describeAiProviders(env: NodeJS.ProcessEnv = process.env): {
  id: string;
  label: string;
  configured: boolean;
}[] {
  const configured = new Set(readAiProviders(env).map((p) => p.id));
  return [
    { id: "qwen-cloud", label: "Qwen Cloud", configured: configured.has("qwen-cloud") },
    { id: "gmi-cloud", label: "GMI Cloud", configured: configured.has("gmi-cloud") },
  ];
}
