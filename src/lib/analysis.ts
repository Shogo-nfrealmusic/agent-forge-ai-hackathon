import type { AnalysisResult, Booking } from "@/lib/types";
import { getWeatherForBooking } from "@/lib/weather/open-meteo";
import { getDayForecast } from "@/lib/weather/hourly";
import { evaluateDeterministicRisk, maxRiskLevel } from "@/lib/risk/rules";
import { getAiRecommendation } from "@/lib/ai/adapter";
import { analyseWindows } from "@/lib/windows";
import { describeDeliveryProviders } from "@/lib/delivery";

/**
 * Orchestrates one booking analysis:
 *   weather → deterministic rules → AI recommendation → alternative windows.
 *
 * The deterministic result is computed BEFORE the AI runs and is passed to the
 * AI as context, but the AI can never modify it. Divergence between the two is
 * surfaced as `agreement: "needs_check"` (UI: NEEDS CHECK).
 *
 * Read-only: nothing here writes to any booking system.
 */
export async function analyzeBooking(booking: Booking): Promise<AnalysisResult> {
  // The booking-window summary and the full-day forecast are independent.
  const [weather, dayForecast] = await Promise.all([
    getWeatherForBooking(booking),
    getDayForecast(booking),
  ]);

  const deterministic = evaluateDeterministicRisk(weather);

  // The recommendation and the window analysis both talk to a provider, but they
  // answer different questions, so they run in parallel.
  const [ai, windows] = await Promise.all([
    getAiRecommendation(booking, weather, deterministic),
    analyseWindows(booking, dayForecast),
  ]);

  const agreement =
    deterministic.riskLevel === ai.recommendation.riskLevel ? "agree" : "needs_check";

  return {
    booking,
    weather,
    deterministic,
    ai,
    agreement,
    effectiveRiskLevel: maxRiskLevel(deterministic.riskLevel, ai.recommendation.riskLevel),
    analyzedAt: new Date().toISOString(),
    delivery: { providers: describeDeliveryProviders() },
    windows,
  };
}
