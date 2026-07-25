import type {
  AiRecommendation,
  Booking,
  DeterministicRisk,
  Recommendation,
  RiskLevel,
  WeatherSummary,
} from "@/lib/types";
import { THUNDERSTORM_CODES } from "@/lib/risk/rules";

/**
 * Mock AI adapter.
 *
 * Used when no API key is configured, when the live provider fails, or when the
 * live response fails validation. It is intentionally a *slightly different*
 * heuristic from the deterministic rules (medium at >=60% instead of >=70%) so
 * the demo can exercise the "AI and rules disagree -> NEEDS CHECK" path without
 * a network call.
 *
 * Messages are kept short enough to work as a WhatsApp message.
 */

const MOCK_THRESHOLDS = {
  precipMedium: 60,
  precipHigh: 80,
  windHigh: 30,
} as const;

function mockRiskLevel(weather: WeatherSummary): RiskLevel {
  const hasThunder = weather.weatherCodes.some((c) =>
    (THUNDERSTORM_CODES as readonly number[]).includes(c),
  );
  const wind = Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh);

  if (weather.alerts.length > 0 || hasThunder || wind >= MOCK_THRESHOLDS.windHigh) return "high";
  if (weather.precipitationProbabilityMax >= MOCK_THRESHOLDS.precipHigh) return "high";
  if (weather.precipitationProbabilityMax >= MOCK_THRESHOLDS.precipMedium) return "medium";
  return "low";
}

const RECOMMENDATION_BY_LEVEL: Record<RiskLevel, Recommendation> = {
  low: "keep",
  medium: "plan_change",
  high: "reschedule",
};

const CONFIDENCE_BY_LEVEL: Record<RiskLevel, number> = {
  low: 0.82,
  medium: 0.64,
  high: 0.78,
};

function buildSummary(weather: WeatherSummary, level: RiskLevel): string {
  const parts = [
    `${weather.precipitationProbabilityMax}% chance of rain`,
    `max wind ${Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh)} km/h`,
    weather.conditionLabel.toLowerCase(),
  ];
  if (weather.alerts.length > 0) parts.push(`warning: ${weather.alerts.join(", ")}`);

  const verdict: Record<RiskLevel, string> = {
    low: "The shoot should go ahead without significant disruption.",
    medium: "The shoot is possible, but conditions may turn; worth offering options.",
    high: "An outdoor shoot as planned is unlikely to work.",
  };
  return `${parts.join(", ")}. ${verdict[level]}`;
}

function buildCustomerMessage(
  booking: Booking,
  weather: WeatherSummary,
  level: RiskLevel,
): string {
  const when = `${booking.date}, ${booking.time}`;
  const head = `Hi ${booking.customerName}, this is the studio team about your ${booking.plan} booking on ${when} at ${booking.location}.`;
  const weatherLine = `The current forecast for that window is ${weather.conditionLabel.toLowerCase()} with a ${weather.precipitationProbabilityMax}% chance of rain.`;

  const body: Record<RiskLevel, string> = {
    low: "Everything looks good to go ahead as planned. We will let you know if the forecast changes closer to the day.",
    medium:
      "Conditions could turn during the session. If you would like, we can (1) shift the start time by an hour, (2) move to a covered location nearby, or (3) reschedule to another day. Just reply with what suits you best and we will check availability.",
    high: "For safety and for the quality of the photos, we would like to suggest moving the session to another day, or switching to an indoor location. There is no extra charge for the change. Could you reply with a couple of dates that work for you?",
  };

  return `${head}\n\n${weatherLine} ${body[level]}\n\nThank you,\nStudio Operations`;
}

export function generateMockRecommendation(
  booking: Booking,
  weather: WeatherSummary,
  deterministic: DeterministicRisk,
): AiRecommendation {
  const level = mockRiskLevel(weather);
  const disagrees = level !== deterministic.riskLevel;

  return {
    riskLevel: level,
    summary:
      buildSummary(weather, level) +
      (disagrees
        ? " (This differs from the deterministic rule result, so a staff member must review it.)"
        : ""),
    recommendation: disagrees ? "contact_staff" : RECOMMENDATION_BY_LEVEL[level],
    customerMessage: buildCustomerMessage(booking, weather, level),
    confidence: disagrees ? 0.5 : CONFIDENCE_BY_LEVEL[level],
    requiresHumanReview: true,
  };
}
