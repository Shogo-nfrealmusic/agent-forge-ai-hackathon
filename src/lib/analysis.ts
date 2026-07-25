import type { AnalysisResult, Booking } from "@/lib/types";
import { getWeatherForBooking } from "@/lib/weather/open-meteo";
import { evaluateDeterministicRisk, maxRiskLevel } from "@/lib/risk/rules";
import { getAiRecommendation } from "@/lib/ai/adapter";
import { describeDeliveryProviders } from "@/lib/delivery";

/**
 * Orchestrates one booking analysis: weather → deterministic rules → AI.
 *
 * The deterministic result is computed BEFORE the AI runs and is passed to the
 * AI as context, but the AI can never modify it. Divergence between the two is
 * surfaced as `agreement: "needs_check"` (UI: NEEDS CHECK).
 *
 * Read-only: nothing here writes to any booking system.
 */
export async function analyzeBooking(booking: Booking): Promise<AnalysisResult> {
  const weather = await getWeatherForBooking(booking);
  const deterministic = evaluateDeterministicRisk(weather);
  const ai = await getAiRecommendation(booking, weather, deterministic);

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
  };
}
