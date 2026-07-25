import { afterEach, describe, expect, it, vi } from "vitest";
import { describeAiProviders, readAiProviders, readGmiConfig, readQwenConfig } from "@/lib/ai/providers";
import { getAiRecommendation } from "@/lib/ai/adapter";
import { evaluateDeterministicRisk } from "@/lib/risk/rules";
import { findBooking } from "@/lib/fixtures/bookings";
import type { AiProviderConfig } from "@/lib/ai/providers";
import type { Booking } from "@/lib/types";
import { makeWeather } from "./helpers";

const booking = findBooking("demo-booking-004") as Booking;
const weather = makeWeather({ precipitationProbabilityMax: 85, weatherCodes: [65] });
const deterministic = evaluateDeterministicRisk(weather);

const QWEN: AiProviderConfig = {
  id: "qwen-cloud",
  label: "Qwen Cloud",
  apiKey: "qwen-key-not-real",
  baseUrl: "https://qwen.invalid/v1",
  model: "qwen-plus",
};

const GMI: AiProviderConfig = {
  id: "gmi-cloud",
  label: "GMI Cloud",
  apiKey: "gmi-key-not-real",
  baseUrl: "https://gmi.invalid/v1",
  model: "gmi-model",
};

const VALID = JSON.stringify({
  riskLevel: "high",
  summary: "High chance of rain",
  recommendation: "reschedule",
  customerMessage: "We suggest another date.",
  confidence: 0.9,
  requiresHumanReview: true,
});

function completion(content: string) {
  return { ok: true, json: async () => ({ model: "m", choices: [{ message: { content } }] }) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provider configuration", () => {
  it("returns no providers when nothing is configured", () => {
    expect(readAiProviders({} as unknown as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("defaults Qwen Cloud to the DashScope OpenAI-compatible endpoint", () => {
    const cfg = readQwenConfig({ AI_API_KEY: "k" } as unknown as NodeJS.ProcessEnv);
    expect(cfg?.id).toBe("qwen-cloud");
    expect(cfg?.baseUrl).toContain("dashscope-intl.aliyuncs.com");
  });

  it("defaults GMI Cloud to its serving endpoint", () => {
    const cfg = readGmiConfig({ GMI_API_KEY: "k" } as unknown as NodeJS.ProcessEnv);
    expect(cfg?.id).toBe("gmi-cloud");
    expect(cfg?.baseUrl).toBe("https://api.gmi-serving.com/v1");
  });

  it("orders the chain Qwen Cloud first, GMI Cloud second", () => {
    const providers = readAiProviders({
      AI_API_KEY: "a",
      GMI_API_KEY: "b",
    } as unknown as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.id)).toEqual(["qwen-cloud", "gmi-cloud"]);
  });

  it("works with only the failover provider configured", () => {
    const providers = readAiProviders({ GMI_API_KEY: "b" } as unknown as NodeJS.ProcessEnv);
    expect(providers.map((p) => p.id)).toEqual(["gmi-cloud"]);
  });

  it("never reads a NEXT_PUBLIC_ variable", () => {
    expect(
      readAiProviders({
        NEXT_PUBLIC_AI_API_KEY: "leaked",
        NEXT_PUBLIC_GMI_API_KEY: "leaked",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual([]);
  });

  it("reports capability without exposing a key", () => {
    const described = describeAiProviders({ AI_API_KEY: "secret" } as unknown as NodeJS.ProcessEnv);
    expect(described.find((p) => p.id === "qwen-cloud")?.configured).toBe(true);
    expect(described.find((p) => p.id === "gmi-cloud")?.configured).toBe(false);
    expect(JSON.stringify(described)).not.toContain("secret");
  });
});

describe("provider failover", () => {
  it("uses the primary provider when it works", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(completion(VALID));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getAiRecommendation(booking, weather, deterministic, {
      providers: [QWEN, GMI],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("live");
    expect(result.provider).toBe("qwen-cloud");
  });

  it("fails over to GMI Cloud when Qwen Cloud is unreachable", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(completion(VALID));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getAiRecommendation(booking, weather, deterministic, {
      providers: [QWEN, GMI],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("live");
    expect(result.provider).toBe("gmi-cloud");
    expect(result.fallbackReason).toContain("Failed over");
  });

  it("fails over when the primary returns an off-schema payload", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(completion('{"riskLevel":"catastrophic"}'))
      .mockResolvedValueOnce(completion(VALID));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getAiRecommendation(booking, weather, deterministic, {
      providers: [QWEN, GMI],
    });
    expect(result.provider).toBe("gmi-cloud");
  });

  it("falls back to mock when every provider fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await getAiRecommendation(booking, weather, deterministic, {
      providers: [QWEN, GMI],
    });

    expect(result.source).toBe("mock");
    expect(result.recommendation.requiresHumanReview).toBe(true);
  });

  it("does not leak either key into a URL or a request body", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(completion(VALID));
    vi.stubGlobal("fetch", fetchSpy);

    await getAiRecommendation(booking, weather, deterministic, { providers: [QWEN, GMI] });

    for (const [url, init] of fetchSpy.mock.calls as [string, RequestInit][]) {
      expect(url).not.toContain(QWEN.apiKey);
      expect(url).not.toContain(GMI.apiKey);
      expect(String(init.body)).not.toContain(QWEN.apiKey);
      expect(String(init.body)).not.toContain(GMI.apiKey);
    }
  });

  it("does not report a provider id when the mock answered", async () => {
    const result = await getAiRecommendation(booking, weather, deterministic, { providers: [] });
    expect(result.source).toBe("mock");
    expect(result.provider).toBeUndefined();
  });
});
