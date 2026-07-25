import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeBooking } from "@/lib/analysis";
import { findBooking } from "@/lib/fixtures/bookings";
import type { Booking } from "@/lib/types";

/**
 * End-to-end (offline) analysis: fixture weather + deterministic rules + mock AI.
 * WEATHER_USE_LIVE=false and no AI_API_KEY → completely deterministic.
 */

const prevWeatherFlag = process.env.WEATHER_USE_LIVE;
const prevKey = process.env.AI_API_KEY;

beforeEach(() => {
  process.env.WEATHER_USE_LIVE = "false";
  delete process.env.AI_API_KEY;
});

afterEach(() => {
  if (prevWeatherFlag === undefined) delete process.env.WEATHER_USE_LIVE;
  else process.env.WEATHER_USE_LIVE = prevWeatherFlag;
  if (prevKey === undefined) delete process.env.AI_API_KEY;
  else process.env.AI_API_KEY = prevKey;
  vi.restoreAllMocks();
});

const cases: { id: string; expected: "low" | "medium" | "high" }[] = [
  { id: "demo-booking-001", expected: "low" },
  { id: "demo-booking-002", expected: "low" }, // 65% — below the 70% rule threshold
  { id: "demo-booking-003", expected: "medium" }, // 75%
  { id: "demo-booking-004", expected: "high" }, // 85%
  { id: "demo-booking-005", expected: "high" }, // thunderstorm
  { id: "demo-booking-006", expected: "high" }, // typhoon advisory + 42 km/h wind
];

describe("analyzeBooking (offline)", () => {
  it.each(cases)("$id → deterministic risk $expected", async ({ id, expected }) => {
    const result = await analyzeBooking(findBooking(id) as Booking);
    expect(result.deterministic.riskLevel).toBe(expected);
    expect(result.weather.source).toBe("fixture");
    expect(result.ai.source).toBe("mock");
  });

  it("always returns both the rule result and the AI result", async () => {
    const result = await analyzeBooking(findBooking("demo-booking-003") as Booking);
    expect(result.deterministic.riskLevel).toBeDefined();
    expect(result.ai.recommendation.riskLevel).toBeDefined();
    expect(result.ai.recommendation.requiresHumanReview).toBe(true);
  });

  it('flags "needs_check" when the AI level differs from the rule level', async () => {
    // 65% precipitation: rules say low (<70), the mock AI says medium (>=60).
    const result = await analyzeBooking(findBooking("demo-booking-002") as Booking);
    expect(result.deterministic.riskLevel).toBe("low");
    expect(result.ai.recommendation.riskLevel).toBe("medium");
    expect(result.agreement).toBe("needs_check");
    expect(result.effectiveRiskLevel).toBe("medium"); // safer of the two
  });

  it('flags "agree" when both reach the same level', async () => {
    const result = await analyzeBooking(findBooking("demo-booking-004") as Booking);
    expect(result.agreement).toBe("agree");
    expect(result.effectiveRiskLevel).toBe("high");
  });

  it("never returns a booking mutation instruction", async () => {
    const result = await analyzeBooking(findBooking("demo-booking-006") as Booking);
    expect(["keep", "reschedule", "plan_change", "contact_staff"]).toContain(
      result.ai.recommendation.recommendation,
    );
    expect(JSON.stringify(result)).not.toContain("cancelBooking");
    expect(JSON.stringify(result)).not.toContain("refund");
  });

  it("still produces a full result when the weather API is broken", async () => {
    process.env.WEATHER_USE_LIVE = "true";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await analyzeBooking(findBooking("demo-booking-005") as Booking);
    expect(result.weather.degraded).toBe(true);
    expect(result.deterministic.riskLevel).toBe("high");
    expect(result.ai.recommendation.customerMessage.length).toBeGreaterThan(0);
  });
});
