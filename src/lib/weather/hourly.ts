import type { Booking, DayForecast, HourlyPoint } from "@/lib/types";
import { getFixtureWeather } from "@/lib/fixtures/weather";

/**
 * Full-day hourly forecast for a booking date.
 *
 * The booking-window summary in `open-meteo.ts` answers "how bad is the slot we
 * booked?". This answers "is there a better slot on the same day?", which is
 * what the alternative-window analysis needs.
 *
 * Same policy as everywhere else: never throws, always falls back to fixture
 * data, and says so via `degraded` / `fallbackReason`.
 */

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 6000;

/** Daylight hours only — nobody books an outdoor portrait at 03:00. */
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 20;

const HOURLY_FIELDS = [
  "precipitation_probability",
  "precipitation",
  "wind_speed_10m",
  "wind_gusts_10m",
  "temperature_2m",
  "weather_code",
].join(",");

interface OpenMeteoHourly {
  time?: string[];
  precipitation_probability?: (number | null)[];
  precipitation?: (number | null)[];
  wind_speed_10m?: (number | null)[];
  wind_gusts_10m?: (number | null)[];
  temperature_2m?: (number | null)[];
  weather_code?: (number | null)[];
}

function num(v: number | null | undefined, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Exported for tests — pure, no network. */
export function parseDayHourly(hourly: OpenMeteoHourly, date: string): HourlyPoint[] {
  const times = hourly.time;
  if (!Array.isArray(times) || times.length === 0) return [];

  const points: HourlyPoint[] = [];
  times.forEach((t, i) => {
    if (!t.startsWith(date)) return;
    const hour = Number(t.slice(11, 13));
    if (!Number.isFinite(hour) || hour < DAY_START_HOUR || hour > DAY_END_HOUR) return;

    points.push({
      hour,
      time: formatHour(hour),
      precipitationProbability: Math.round(num(hourly.precipitation_probability?.[i])),
      precipitationMm: round(num(hourly.precipitation?.[i])),
      windSpeedKmh: round(num(hourly.wind_speed_10m?.[i])),
      windGustKmh: round(num(hourly.wind_gusts_10m?.[i])),
      temperatureC: round(num(hourly.temperature_2m?.[i])),
      weatherCode: num(hourly.weather_code?.[i], 2),
    });
  });

  return points.sort((a, b) => a.hour - b.hour);
}

/**
 * Build a plausible day curve from a fixture summary.
 *
 * The fixture only describes the booking window, so we spread it across the day
 * as a single peak centred on the booking hour. It is synthetic — and labelled
 * as such via `source: "fixture"` — but it is deterministic, which keeps the
 * demo and the tests stable.
 */
export function buildFixtureDayHourly(booking: Booking): HourlyPoint[] {
  const summary = getFixtureWeather(booking.bookingId, {
    date: booking.date,
    timeRange: booking.time,
  });

  const peakHour = Number(booking.time.slice(0, 2));
  const peakPop = summary.precipitationProbabilityMax;
  const peakWind = Math.max(summary.windSpeedMaxKmh, summary.windGustMaxKmh);
  const baseTemp = summary.temperatureC;

  const points: HourlyPoint[] = [];
  for (let hour = DAY_START_HOUR; hour <= DAY_END_HOUR; hour++) {
    const distance = Math.abs(hour - peakHour);
    const decay = distance * 12;

    const pop = Math.max(5, peakPop - decay);
    const wind = Math.max(6, round(peakWind - distance * 4));
    // Warmest in the early afternoon.
    const temp = round(baseTemp - Math.abs(hour - 14) * 0.6);

    points.push({
      hour,
      time: formatHour(hour),
      precipitationProbability: Math.round(pop),
      precipitationMm: round(distance === 0 ? summary.precipitationMm : Math.max(0, pop / 25)),
      windSpeedKmh: wind,
      windGustKmh: round(wind * 1.4),
      temperatureC: temp,
      // Severe codes only stay near the peak; elsewhere it is partly cloudy.
      weatherCode: distance <= 1 ? (summary.weatherCodes[0] ?? 2) : pop > 50 ? 61 : 2,
    });
  }

  return points;
}

function fixtureForecast(booking: Booking, fallbackReason?: string): DayForecast {
  return {
    source: "fixture",
    degraded: Boolean(fallbackReason),
    fallbackReason,
    date: booking.date,
    hours: buildFixtureDayHourly(booking),
  };
}

/** NEVER throws. */
export async function getDayForecast(
  booking: Booking,
  opts: { useLive?: boolean } = {},
): Promise<DayForecast> {
  const useLive = opts.useLive ?? process.env.WEATHER_USE_LIVE !== "false";
  if (!useLive) return fixtureForecast(booking);

  const params = new URLSearchParams({
    latitude: String(booking.latitude),
    longitude: String(booking.longitude),
    hourly: HOURLY_FIELDS,
    timezone: booking.timezone,
    start_date: booking.date,
    end_date: booking.date,
    wind_speed_unit: "kmh",
  });

  try {
    const res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) return fixtureForecast(booking, `Open-Meteo returned HTTP ${res.status}`);

    const json = (await res.json()) as { hourly?: OpenMeteoHourly };
    const hours = parseDayHourly(json.hourly ?? {}, booking.date);

    if (hours.length === 0) {
      return fixtureForecast(
        booking,
        "No hourly data for that date (Open-Meteo only forecasts ~16 days ahead)",
      );
    }

    return { source: "open-meteo", degraded: false, date: booking.date, hours };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fixtureForecast(booking, `Could not reach Open-Meteo: ${message}`);
  }
}
