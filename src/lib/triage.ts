import type { Booking, DeterministicRisk, WeatherSummary } from "@/lib/types";
import { listBookings } from "@/lib/fixtures/bookings";
import { getWeatherForBooking } from "@/lib/weather/open-meteo";
import { evaluateDeterministicRisk } from "@/lib/risk/rules";

/**
 * Booking triage for the list screen.
 *
 * A studio with a real calendar has too many bookings to eyeball, and most of
 * them need nothing. The list therefore runs the DETERMINISTIC RULES ONLY over
 * every booking (fast, explainable, no AI and no sandbox cost) and sorts them
 * into three tiers:
 *
 *   action — a rule fired (medium / high). These need a staff decision.
 *   watch  — no rule fired, but the forecast is close to a threshold.
 *   clear  — nothing to do; collapsed by default in the UI.
 *
 * The full AI + sandbox analysis stays on the detail page, where it runs for
 * one booking at a time.
 */

export type TriageTier = "action" | "watch" | "clear";

export interface TriagedBooking {
  booking: Booking;
  weather: WeatherSummary;
  risk: DeterministicRisk;
  tier: TriageTier;
}

export interface TriageResult {
  action: TriagedBooking[];
  watch: TriagedBooking[];
  clear: TriagedBooking[];
  total: number;
}

/** "Close to a threshold" — worth a glance even though no rule fired. */
export const WATCH_THRESHOLDS = {
  precipProb: 50, // rules flag at 70
  windKmh: 25, // rules flag at 30
} as const;

export function tierFor(risk: DeterministicRisk, weather: WeatherSummary): TriageTier {
  if (risk.riskLevel !== "low") return "action";

  const wind = Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh);
  if (
    weather.precipitationProbabilityMax >= WATCH_THRESHOLDS.precipProb ||
    wind >= WATCH_THRESHOLDS.windKmh
  ) {
    return "watch";
  }
  return "clear";
}

const RISK_ORDER = { high: 0, medium: 1, low: 2 } as const;

function sortGroup(items: TriagedBooking[]): TriagedBooking[] {
  return [...items].sort((a, b) => {
    const byRisk = RISK_ORDER[a.risk.riskLevel] - RISK_ORDER[b.risk.riskLevel];
    if (byRisk !== 0) return byRisk;
    return `${a.booking.date} ${a.booking.time}`.localeCompare(
      `${b.booking.date} ${b.booking.time}`,
    );
  });
}

/* ------------------------------------------------------------------------ */
/* Cache — the list page should not refetch N forecasts on every render.     */
/* ------------------------------------------------------------------------ */

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; result: TriageResult } | null = null;

export function clearTriageCache(): void {
  cache = null;
}

export async function triageBookings(
  opts: { bookings?: Booking[]; useCache?: boolean } = {},
): Promise<TriageResult> {
  const useCache = opts.useCache ?? true;
  if (useCache && !opts.bookings && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.result;
  }

  const bookings = opts.bookings ?? listBookings();

  const items = await Promise.all(
    bookings.map(async (booking): Promise<TriagedBooking> => {
      const weather = await getWeatherForBooking(booking);
      const risk = evaluateDeterministicRisk(weather);
      return { booking, weather, risk, tier: tierFor(risk, weather) };
    }),
  );

  const result: TriageResult = {
    action: sortGroup(items.filter((i) => i.tier === "action")),
    watch: sortGroup(items.filter((i) => i.tier === "watch")),
    clear: sortGroup(items.filter((i) => i.tier === "clear")),
    total: items.length,
  };

  if (useCache && !opts.bookings) cache = { at: Date.now(), result };
  return result;
}
