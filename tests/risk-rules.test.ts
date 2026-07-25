import { describe, expect, it } from "vitest";
import { evaluateDeterministicRisk, maxRiskLevel } from "@/lib/risk/rules";
import { makeWeather } from "./helpers";

describe("deterministic risk rules — level assignment", () => {
  it("returns low when nothing is triggered", () => {
    const result = evaluateDeterministicRisk(
      makeWeather({ precipitationProbabilityMax: 30, windSpeedMaxKmh: 12, windGustMaxKmh: 18 }),
    );
    expect(result.riskLevel).toBe("low");
    expect(result.hits).toHaveLength(0);
  });

  it("returns medium at exactly 70% precipitation probability", () => {
    const result = evaluateDeterministicRisk(makeWeather({ precipitationProbabilityMax: 70 }));
    expect(result.riskLevel).toBe("medium");
    expect(result.hits.map((h) => h.id)).toContain("precip-medium");
  });

  it("stays low at 69% precipitation probability", () => {
    expect(
      evaluateDeterministicRisk(makeWeather({ precipitationProbabilityMax: 69 })).riskLevel,
    ).toBe("low");
  });

  it("returns high at exactly 80% precipitation probability", () => {
    const result = evaluateDeterministicRisk(makeWeather({ precipitationProbabilityMax: 80 }));
    expect(result.riskLevel).toBe("high");
    expect(result.hits.map((h) => h.id)).toContain("precip-high");
  });

  it("returns medium at 79% and high at 85%", () => {
    expect(
      evaluateDeterministicRisk(makeWeather({ precipitationProbabilityMax: 79 })).riskLevel,
    ).toBe("medium");
    expect(
      evaluateDeterministicRisk(makeWeather({ precipitationProbabilityMax: 85 })).riskLevel,
    ).toBe("high");
  });
});

describe("deterministic risk rules — severe weather", () => {
  it.each([95, 96, 99])("returns high for thunderstorm code %i", (code) => {
    const result = evaluateDeterministicRisk(
      makeWeather({ weatherCodes: [3, code], precipitationProbabilityMax: 20 }),
    );
    expect(result.riskLevel).toBe("high");
    expect(result.hits.map((h) => h.id)).toContain("thunderstorm");
  });

  it("returns high when a warning/typhoon advisory is present, even in fine weather", () => {
    const result = evaluateDeterministicRisk(
      makeWeather({
        precipitationProbabilityMax: 5,
        windSpeedMaxKmh: 8,
        windGustMaxKmh: 10,
        alerts: ["台風接近に伴う暴風注意報"],
      }),
    );
    expect(result.riskLevel).toBe("high");
    expect(result.hits.map((h) => h.id)).toContain("severe-alert");
  });

  it("returns high at exactly 30 km/h sustained wind", () => {
    const result = evaluateDeterministicRisk(
      makeWeather({ windSpeedMaxKmh: 30, windGustMaxKmh: 30, precipitationProbabilityMax: 10 }),
    );
    expect(result.riskLevel).toBe("high");
    expect(result.hits.map((h) => h.id)).toContain("strong-wind");
  });

  it("stays low at 29 km/h wind", () => {
    expect(
      evaluateDeterministicRisk(
        makeWeather({ windSpeedMaxKmh: 29, windGustMaxKmh: 29, precipitationProbabilityMax: 10 }),
      ).riskLevel,
    ).toBe("low");
  });

  it("uses gusts when they exceed sustained wind", () => {
    const result = evaluateDeterministicRisk(
      makeWeather({ windSpeedMaxKmh: 18, windGustMaxKmh: 45 }),
    );
    expect(result.riskLevel).toBe("high");
    expect(result.hits.map((h) => h.id)).toContain("strong-wind");
  });

  it("escalates to high when several rules fire at once", () => {
    const result = evaluateDeterministicRisk(
      makeWeather({
        precipitationProbabilityMax: 75, // medium on its own
        windSpeedMaxKmh: 40, // high
        weatherCodes: [95], // high
        alerts: ["暴風警報"], // high
      }),
    );
    expect(result.riskLevel).toBe("high");
    expect(result.hits.length).toBeGreaterThanOrEqual(4);
  });

  it("always produces a human-readable reason", () => {
    expect(evaluateDeterministicRisk(makeWeather()).reason).toBeTruthy();
    expect(
      evaluateDeterministicRisk(makeWeather({ precipitationProbabilityMax: 90 })).reason,
    ).toContain("90%");
  });
});

describe("maxRiskLevel", () => {
  it("picks the more severe level", () => {
    expect(maxRiskLevel("low", "high")).toBe("high");
    expect(maxRiskLevel("medium", "low")).toBe("medium");
    expect(maxRiskLevel("medium", "high")).toBe("high");
    expect(maxRiskLevel("low", "low")).toBe("low");
  });
});
