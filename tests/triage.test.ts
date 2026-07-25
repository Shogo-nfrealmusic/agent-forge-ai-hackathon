import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearTriageCache, tierFor, triageBookings, WATCH_THRESHOLDS } from "@/lib/triage";
import { evaluateDeterministicRisk } from "@/lib/risk/rules";
import { LOCALES, messages } from "@/lib/i18n/messages";
import { makeWeather } from "./helpers";

const prevWeatherFlag = process.env.WEATHER_USE_LIVE;

beforeEach(() => {
  process.env.WEATHER_USE_LIVE = "false"; // fixtures only — deterministic
  clearTriageCache();
});

afterEach(() => {
  if (prevWeatherFlag === undefined) delete process.env.WEATHER_USE_LIVE;
  else process.env.WEATHER_USE_LIVE = prevWeatherFlag;
});

function tier(overrides: Parameters<typeof makeWeather>[0]) {
  const weather = makeWeather(overrides);
  return tierFor(evaluateDeterministicRisk(weather), weather);
}

describe("triage tiers", () => {
  it("puts any rule hit into the action tier", () => {
    expect(tier({ precipitationProbabilityMax: 70 })).toBe("action"); // medium
    expect(tier({ precipitationProbabilityMax: 85 })).toBe("action"); // high
    expect(tier({ weatherCodes: [95] })).toBe("action"); // thunder
    expect(tier({ windSpeedMaxKmh: 35, windGustMaxKmh: 35 })).toBe("action"); // wind
  });

  it("puts near-threshold forecasts into the watch tier", () => {
    expect(tier({ precipitationProbabilityMax: WATCH_THRESHOLDS.precipProb })).toBe("watch");
    expect(tier({ precipitationProbabilityMax: 65 })).toBe("watch");
    expect(
      tier({ windSpeedMaxKmh: WATCH_THRESHOLDS.windKmh, windGustMaxKmh: WATCH_THRESHOLDS.windKmh }),
    ).toBe("watch");
  });

  it("puts calm forecasts into the clear tier", () => {
    expect(tier({ precipitationProbabilityMax: 30, windSpeedMaxKmh: 10, windGustMaxKmh: 15 })).toBe(
      "clear",
    );
  });

  it("watch never overrides a rule hit", () => {
    // 85% is both >= watch threshold and >= rule threshold — action wins.
    expect(tier({ precipitationProbabilityMax: 85 })).toBe("action");
  });
});

describe("triageBookings over the fixtures", () => {
  it("flags the storm bookings and leaves the calm ones collapsed", async () => {
    const result = await triageBookings({ useCache: false });

    const ids = (tier: "action" | "watch" | "clear") =>
      result[tier].map((i) => i.booking.bookingId);

    // The four storm scenarios need action…
    for (const id of [
      "demo-booking-003",
      "demo-booking-004",
      "demo-booking-005",
      "demo-booking-006",
    ]) {
      expect(ids("action")).toContain(id);
    }
    // …the borderline one (65%) is a watch…
    expect(ids("watch")).toContain("demo-booking-002");
    // …and the calm ones stay out of the way.
    for (const id of ["demo-booking-001", "demo-booking-008", "demo-booking-010"]) {
      expect(ids("clear")).toContain(id);
    }

    expect(result.total).toBe(
      result.action.length + result.watch.length + result.clear.length,
    );
  });

  it("sorts the action tier most-severe first", async () => {
    const result = await triageBookings({ useCache: false });
    const levels = result.action.map((i) => i.risk.riskLevel);
    const firstMedium = levels.indexOf("medium");
    const lastHigh = levels.lastIndexOf("high");
    if (firstMedium !== -1 && lastHigh !== -1) {
      expect(lastHigh).toBeLessThan(firstMedium);
    }
  });

  it("caches and can be cleared", async () => {
    const first = await triageBookings();
    const second = await triageBookings();
    expect(second).toBe(first); // same object -> cache hit
    clearTriageCache();
    const third = await triageBookings();
    expect(third).not.toBe(first);
  });
});

describe("i18n dictionaries", () => {
  function shape(value: unknown, path: string[] = []): string[] {
    if (typeof value === "function") return [path.join(".") + ":fn"];
    if (value !== null && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
        shape(v, [...path, k]),
      );
    }
    return [path.join(".") + ":str"];
  }

  it("en and ja expose exactly the same keys and kinds", () => {
    expect(shape(messages.ja).sort()).toEqual(shape(messages.en).sort());
  });

  it("covers every declared locale", () => {
    for (const locale of LOCALES) {
      expect(messages[locale]).toBeDefined();
    }
  });

  it("keeps customer-facing drafts out of the dictionary", () => {
    // The dictionary is operator UI only. Nothing in it should look like a
    // message template addressed to a customer.
    const flat = JSON.stringify(messages);
    expect(flat).not.toContain("Dear customer");
    expect(flat).not.toContain("Hi Demo");
  });
});
