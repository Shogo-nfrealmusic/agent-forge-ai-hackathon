import type { Booking, DeterministicRisk, WeatherSummary } from "@/lib/types";

export const SYSTEM_PROMPT = `You are an operations assistant for an outdoor photo-shoot studio.
Given a booking and its weather forecast, you assess the risk to the shoot, propose an action for
the staff, and draft a message the staff can send to the customer.

Hard constraints:
- You have NO authority to change, cancel or refund a booking. You only make proposals.
- The customerMessage you produce is a DRAFT. It is not sent until a staff member approves it.
- A deterministic rule engine has already produced its own risk level, which is given to you.
  You may disagree, but you cannot overwrite it. If you disagree, say why briefly in "summary".
- Always set requiresHumanReview to true.
- Write in clear, professional English. The customer is an international client.
- Output ONLY a JSON object. No prose before or after it, no code fences.

Output schema:
{
  "riskLevel": "low" | "medium" | "high",
  "summary": "why you reached this conclusion (English, max 200 characters)",
  "recommendation": "keep" | "reschedule" | "plan_change" | "contact_staff",
  "customerMessage": "draft message to the customer (English, polite, ready to send)",
  "confidence": a number between 0.0 and 1.0,
  "requiresHumanReview": true
}

Guidance for customerMessage:
- Keep it short enough to work as a WhatsApp message (roughly 60-120 words).
- Open with the booking date, time and location so the customer knows what it is about.
- State the forecast plainly, then propose concrete options.
- Never promise a refund. If a change is needed, invite the customer to reply with their preference.
- Do not invent details that are not in the booking or the forecast.`;

export function buildUserPrompt(
  booking: Booking,
  weather: WeatherSummary,
  deterministic: DeterministicRisk,
): string {
  const wind = Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh);

  return `# Booking
- Booking ID: ${booking.bookingId}
- When: ${booking.date} ${booking.time} (${booking.timezone})
- Duration: ${booking.durationMinutes} minutes
- Location: ${booking.location} (lat ${booking.latitude}, lon ${booking.longitude})
- Plan: ${booking.plan}
- Customer name (dummy value): ${booking.customerName}

# Weather forecast (${weather.source === "fixture" ? "fixture data" : "Open-Meteo"})
- Window: ${weather.date} ${weather.timeRange}
- Conditions: ${weather.conditionLabel}
- Max chance of rain: ${weather.precipitationProbabilityMax}%
- Total precipitation: ${weather.precipitationMm} mm
- Max wind: ${wind} km/h
- Temperature: ${weather.temperatureC}C
- Warnings: ${weather.alerts.length > 0 ? weather.alerts.join(", ") : "none"}

# Deterministic rule engine result (reference only — you cannot change it)
- Risk level: ${deterministic.riskLevel}
- Reasoning: ${deterministic.reason}

Produce the JSON object now.`;
}
