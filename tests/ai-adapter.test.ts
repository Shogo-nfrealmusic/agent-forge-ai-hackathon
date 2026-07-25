import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiRecommendation, readAiConfig } from "@/lib/ai/adapter";
import { evaluateDeterministicRisk } from "@/lib/risk/rules";
import { findBooking } from "@/lib/fixtures/bookings";
import type { AiRecommendation, Booking } from "@/lib/types";
import { makeWeather } from "./helpers";

const booking = findBooking("demo-booking-004") as Booking;
const weather = makeWeather({ precipitationProbabilityMax: 85, weatherCodes: [65] });
const deterministic = evaluateDeterministicRisk(weather);
const config = { apiKey: "test-key-not-real", baseUrl: "https://example.invalid/v1", model: "test" };

function chatResponse(content: unknown) {
  return {
    ok: true,
    json: async () => ({ model: "test", choices: [{ message: { content } }] }),
  };
}

const VALID: AiRecommendation = {
  riskLevel: "high",
  summary: "High chance of rain makes an outdoor shoot difficult",
  recommendation: "reschedule",
  customerMessage: "We would like to suggest another date.",
  confidence: 0.9,
  requiresHumanReview: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readAiConfig", () => {
  it("returns null with no API key → mock mode", () => {
    expect(readAiConfig({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(readAiConfig({ AI_API_KEY: "   " } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("reads base url and model from the environment", () => {
    const cfg = readAiConfig({
      AI_API_KEY: "k",
      AI_BASE_URL: "https://example.invalid/v1/",
      AI_MODEL: "qwen-max",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg).toEqual({ apiKey: "k", baseUrl: "https://example.invalid/v1", model: "qwen-max" });
  });

  it("never reads a NEXT_PUBLIC_ variable", () => {
    expect(
      readAiConfig({ NEXT_PUBLIC_AI_API_KEY: "leaked" } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
  });
});

describe("getAiRecommendation — fallback to mock", () => {
  it("falls back to mock when no API key is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getAiRecommendation(booking, weather, deterministic, { config: null });

    expect(result.source).toBe("mock");
    expect(result.fallbackReason).toContain("AI_API_KEY");
    expect(fetchSpy).not.toHaveBeenCalled(); // no network without a key
    expect(result.recommendation.customerMessage.length).toBeGreaterThan(0);
  });

  it("falls back to mock when the provider is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await getAiRecommendation(booking, weather, deterministic, { config });
    expect(result.source).toBe("mock");
    expect(result.fallbackReason).toContain("Could not reach the AI provider");
  });

  it("falls back to mock on a non-2xx response without leaking the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "bad key sk-xxx" }),
    );
    const result = await getAiRecommendation(booking, weather, deterministic, { config });
    expect(result.source).toBe("mock");
    expect(result.fallbackReason).toContain("401");
    expect(result.fallbackReason).not.toContain("sk-");
  });

  it("falls back to mock on a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })),
    );
    const result = await getAiRecommendation(booking, weather, deterministic, { config });
    expect(result.source).toBe("mock");
  });

  it("falls back to mock on an empty completion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse("")));
    const result = await getAiRecommendation(booking, weather, deterministic, { config });
    expect(result.source).toBe("mock");
    expect(result.fallbackReason).toContain("empty response");
  });

  it("falls back to mock when the model returns prose instead of JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(chatResponse("Sorry, I could not make a determination.")),
    );
    const result = await getAiRecommendation(booking, weather, deterministic, { config });
    expect(result.source).toBe("mock");
    expect(result.fallbackReason).toContain("mock");
  });

  it("falls back to mock when the JSON is well-formed but off-schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        chatResponse(JSON.stringify({ riskLevel: "catastrophic", summary: 42 })),
      ),
    );
    const result = await getAiRecommendation(booking, weather, deterministic, { config });
    expect(result.source).toBe("mock");
    expect(["low", "medium", "high"]).toContain(result.recommendation.riskLevel);
  });

  it("mock output is always schema-shaped and flagged for human review", async () => {
    const result = await getAiRecommendation(booking, weather, deterministic, { config: null });
    expect(result.recommendation.requiresHumanReview).toBe(true);
    expect(result.recommendation.confidence).toBeGreaterThanOrEqual(0);
    expect(result.recommendation.confidence).toBeLessThanOrEqual(1);
    expect(["keep", "reschedule", "plan_change", "contact_staff"]).toContain(
      result.recommendation.recommendation,
    );
  });
});

describe("getAiRecommendation — live path", () => {
  it("uses the validated live response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(JSON.stringify(VALID))));
    const result = await getAiRecommendation(booking, weather, deterministic, { config });
    expect(result.source).toBe("live");
    expect(result.recommendation.riskLevel).toBe("high");
    expect(result.recommendation.recommendation).toBe("reschedule");
  });

  it("accepts a ```json fenced response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(chatResponse("```json\n" + JSON.stringify(VALID) + "\n```")),
    );
    const result = await getAiRecommendation(booking, weather, deterministic, { config });
    expect(result.source).toBe("live");
  });

  it("forces requiresHumanReview to true even if the model says false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        chatResponse(JSON.stringify({ ...VALID, requiresHumanReview: false })),
      ),
    );
    const result = await getAiRecommendation(booking, weather, deterministic, { config });
    expect(result.recommendation.requiresHumanReview).toBe(true);
  });

  it("sends the key in the Authorization header only — never in the URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(chatResponse(JSON.stringify(VALID)));
    vi.stubGlobal("fetch", fetchSpy);
    await getAiRecommendation(booking, weather, deterministic, { config });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(config.apiKey);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${config.apiKey}`);
    expect(String(init.body)).not.toContain(config.apiKey);
  });
});
