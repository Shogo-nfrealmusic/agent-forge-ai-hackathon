import type { DeterministicRisk, RiskLevel, RuleHit, WeatherSummary } from "@/lib/types";

/**
 * Deterministic weather-risk rules.
 *
 * These rules are the source of truth. The AI never overrides them — it only
 * runs alongside them, and any disagreement surfaces as "NEEDS CHECK" in the UI.
 *
 * Rule set (as specified):
 *   - precipitation probability >= 70%  -> medium
 *   - precipitation probability >= 80%  -> high
 *   - thunderstorm / typhoon / warning  -> high
 *   - wind speed >= 30 km/h             -> high
 *   - otherwise                         -> low
 */

export const THRESHOLDS = {
  precipProbMedium: 70,
  precipProbHigh: 80,
  windHighKmh: 30,
} as const;

/** WMO weather codes that mean thunderstorm. */
export const THUNDERSTORM_CODES = [95, 96, 99] as const;

const LEVEL_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

export function maxRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
}

export function isThunderstormCode(code: number): boolean {
  return (THUNDERSTORM_CODES as readonly number[]).includes(code);
}

export function evaluateDeterministicRisk(weather: WeatherSummary): DeterministicRisk {
  const hits: RuleHit[] = [];

  // --- HIGH: severe weather warning / typhoon advisory -------------------
  if (weather.alerts.length > 0) {
    hits.push({
      id: "severe-alert",
      level: "high",
      label: "Severe weather warning",
      detail: `Active: ${weather.alerts.join(" / ")}`,
    });
  }

  // --- HIGH: thunderstorm ------------------------------------------------
  const thunderCodes = weather.weatherCodes.filter(isThunderstormCode);
  if (thunderCodes.length > 0) {
    hits.push({
      id: "thunderstorm",
      level: "high",
      label: "Thunderstorm",
      detail: `WMO weather code ${thunderCodes.join(", ")} detected`,
    });
  }

  // --- HIGH: strong wind -------------------------------------------------
  const wind = Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh);
  if (wind >= THRESHOLDS.windHighKmh) {
    hits.push({
      id: "strong-wind",
      level: "high",
      label: "Strong wind",
      detail: `Max wind ${wind} km/h (>= ${THRESHOLDS.windHighKmh} km/h)`,
    });
  }

  // --- HIGH / MEDIUM: precipitation probability --------------------------
  const pop = weather.precipitationProbabilityMax;
  if (pop >= THRESHOLDS.precipProbHigh) {
    hits.push({
      id: "precip-high",
      level: "high",
      label: "Precipitation probability (high)",
      detail: `${pop}% chance of rain (>= ${THRESHOLDS.precipProbHigh}%)`,
    });
  } else if (pop >= THRESHOLDS.precipProbMedium) {
    hits.push({
      id: "precip-medium",
      level: "medium",
      label: "Precipitation probability (medium)",
      detail: `${pop}% chance of rain (>= ${THRESHOLDS.precipProbMedium}%)`,
    });
  }

  const riskLevel = hits.reduce<RiskLevel>((acc, hit) => maxRiskLevel(acc, hit.level), "low");

  const reason =
    hits.length === 0
      ? `No rule triggered (${pop}% chance of rain, ${wind} km/h wind). The shoot can go ahead as far as the rules are concerned.`
      : hits.map((h) => `${h.label}: ${h.detail}`).join(" | ");

  return { riskLevel, hits, reason };
}
