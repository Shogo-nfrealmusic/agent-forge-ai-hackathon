import type { AnalysisResult, Booking, WindowAnalysis } from "@/lib/types";
import { getWeatherForBooking } from "@/lib/weather/open-meteo";
import { getDayForecast } from "@/lib/weather/hourly";
import { evaluateDeterministicRisk, maxRiskLevel } from "@/lib/risk/rules";
import { getAiRecommendation } from "@/lib/ai/adapter";
import { analyseWindows } from "@/lib/windows";
import { describeDeliveryProviders } from "@/lib/delivery";

/**
 * The analysis is split into a fast path and a slow path, and the client
 * requests them separately:
 *
 *   analyzeBooking()        ~5s   weather -> rules -> AI recommendation
 *   analyseBookingWindows() ~20s  day forecast -> AI writes Python -> sandbox
 *
 * Bundling them meant staring at a spinner for twenty seconds before anything
 * appeared. Now the risk assessment and the draft message render immediately
 * and the sandbox result fills in when it is ready.
 */

/**
 * Fast path. The deterministic result is computed BEFORE the AI runs and is
 * passed to it as context, but the AI can never modify it. Divergence is
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

/**
 * Slow path: "is there a better slot today?". The model writes a Python ranking
 * function and it runs inside a Daytona sandbox. Never throws; returns null when
 * the day forecast has too few hours to work with.
 */
export async function analyseBookingWindows(booking: Booking): Promise<WindowAnalysis | null> {
  const forecast = await getDayForecast(booking);
  return analyseWindows(booking, forecast);
}
