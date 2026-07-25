import type { DeterministicRisk, RiskLevel, RuleHit, WeatherSummary } from "@/lib/types";

/**
 * Deterministic weather-risk rules.
 *
 * These rules are the source of truth. The AI never overrides them — it only
 * runs alongside them, and any disagreement surfaces as "要確認" in the UI.
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
      label: "警報・注意報",
      detail: `発表中: ${weather.alerts.join(" / ")}`,
    });
  }

  // --- HIGH: thunderstorm ------------------------------------------------
  const thunderCodes = weather.weatherCodes.filter(isThunderstormCode);
  if (thunderCodes.length > 0) {
    hits.push({
      id: "thunderstorm",
      level: "high",
      label: "雷雨",
      detail: `WMO weather code ${thunderCodes.join(", ")} を検出`,
    });
  }

  // --- HIGH: strong wind -------------------------------------------------
  const wind = Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh);
  if (wind >= THRESHOLDS.windHighKmh) {
    hits.push({
      id: "strong-wind",
      level: "high",
      label: "強風",
      detail: `最大風速 ${wind} km/h (>= ${THRESHOLDS.windHighKmh} km/h)`,
    });
  }

  // --- HIGH / MEDIUM: precipitation probability --------------------------
  const pop = weather.precipitationProbabilityMax;
  if (pop >= THRESHOLDS.precipProbHigh) {
    hits.push({
      id: "precip-high",
      level: "high",
      label: "降水確率(高)",
      detail: `降水確率 ${pop}% (>= ${THRESHOLDS.precipProbHigh}%)`,
    });
  } else if (pop >= THRESHOLDS.precipProbMedium) {
    hits.push({
      id: "precip-medium",
      level: "medium",
      label: "降水確率(中)",
      detail: `降水確率 ${pop}% (>= ${THRESHOLDS.precipProbMedium}%)`,
    });
  }

  const riskLevel = hits.reduce<RiskLevel>((acc, hit) => maxRiskLevel(acc, hit.level), "low");

  const reason =
    hits.length === 0
      ? `該当ルールなし（降水確率 ${pop}% / 風速 ${wind} km/h）。ルール上は撮影可能。`
      : hits.map((h) => `${h.label}: ${h.detail}`).join(" ／ ");

  return { riskLevel, hits, reason };
}
