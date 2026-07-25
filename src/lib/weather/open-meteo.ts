import type { Booking, WeatherSummary } from "@/lib/types";
import { getFixtureWeather } from "@/lib/fixtures/weather";

/**
 * Weather adapter — Open-Meteo (free, no API key required).
 * Docs: https://open-meteo.com/en/docs
 *
 * Every failure path falls back to fixture weather so the UI never breaks.
 * The returned `degraded` flag tells the UI to show a fallback badge.
 */

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 6000;

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

/** WMO weather-code → Japanese label. */
export const WMO_LABELS: Record<number, string> = {
  0: "快晴",
  1: "概ね晴れ",
  2: "一部曇り",
  3: "曇り",
  45: "霧",
  48: "着氷性の霧",
  51: "霧雨(弱)",
  53: "霧雨",
  55: "霧雨(強)",
  61: "雨(弱)",
  63: "雨",
  65: "雨(強)",
  71: "雪(弱)",
  73: "雪",
  75: "雪(強)",
  80: "にわか雨(弱)",
  81: "にわか雨",
  82: "にわか雨(激しい)",
  95: "雷雨",
  96: "雷雨(ひょうを伴う)",
  99: "雷雨(激しいひょう)",
};

export function describeWeatherCodes(codes: number[]): string {
  if (codes.length === 0) return "情報なし";
  const labels = [...new Set(codes)].map((c) => WMO_LABELS[c] ?? `コード${c}`);
  return labels.join(" / ");
}

/** "13:00-14:00" → [13, 14]. Returns null if unparseable. */
export function parseTimeRange(timeRange: string): [number, number] | null {
  const m = timeRange.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const startHour = Number(m[1]);
  const endHour = Number(m[3]);
  const endMinute = Number(m[4]);
  if (Number.isNaN(startHour) || Number.isNaN(endHour)) return null;
  // A shoot ending at 11:30 still occupies the 11:00 hour slot.
  const lastHour = endMinute > 0 ? endHour : Math.max(startHour, endHour - 1);
  return [startHour, Math.max(startHour, lastHour)];
}

function num(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Reduce Open-Meteo hourly arrays to the booking window.
 * Exported for tests — pure, no network.
 */
export function summariseHourly(
  hourly: OpenMeteoHourly,
  booking: Pick<Booking, "date" | "time">,
): Omit<WeatherSummary, "source" | "fetchedAt" | "degraded" | "fallbackReason"> | null {
  const times = hourly.time;
  if (!Array.isArray(times) || times.length === 0) return null;

  const range = parseTimeRange(booking.time);
  if (!range) return null;
  const [startHour, endHour] = range;

  const indices: number[] = [];
  times.forEach((t, i) => {
    // Open-Meteo hourly time format: "2026-08-10T13:00"
    if (!t.startsWith(booking.date)) return;
    const hour = Number(t.slice(11, 13));
    if (hour >= startHour && hour <= endHour) indices.push(i);
  });

  if (indices.length === 0) return null;

  const pick = (arr: (number | null)[] | undefined) =>
    indices.map((i) => num(arr?.[i]));

  const pops = pick(hourly.precipitation_probability);
  const precip = pick(hourly.precipitation);
  const winds = pick(hourly.wind_speed_10m);
  const gusts = pick(hourly.wind_gusts_10m);
  const temps = pick(hourly.temperature_2m);
  const codes = indices
    .map((i) => hourly.weather_code?.[i])
    .filter((c): c is number => typeof c === "number");

  const round = (n: number) => Math.round(n * 10) / 10;

  return {
    date: booking.date,
    timeRange: booking.time,
    precipitationProbabilityMax: Math.round(Math.max(...pops, 0)),
    precipitationMm: round(precip.reduce((a, b) => a + b, 0)),
    windSpeedMaxKmh: round(Math.max(...winds, 0)),
    windGustMaxKmh: round(Math.max(...gusts, 0)),
    temperatureC: round(temps.reduce((a, b) => a + b, 0) / Math.max(temps.length, 1)),
    weatherCodes: [...new Set(codes)],
    conditionLabel: describeWeatherCodes(codes),
    alerts: [], // Open-Meteo does not expose official warnings; see docs/architecture.md
  };
}

export function buildOpenMeteoUrl(booking: Booking): string {
  const params = new URLSearchParams({
    latitude: String(booking.latitude),
    longitude: String(booking.longitude),
    hourly: HOURLY_FIELDS,
    timezone: booking.timezone,
    start_date: booking.date,
    end_date: booking.date,
    wind_speed_unit: "kmh",
  });
  return `${OPEN_METEO_URL}?${params.toString()}`;
}

/**
 * Fetch weather for a booking window. NEVER throws — on any failure it returns
 * fixture weather with `degraded: true` and a human-readable `fallbackReason`.
 */
export async function getWeatherForBooking(
  booking: Booking,
  opts: { useLive?: boolean } = {},
): Promise<WeatherSummary> {
  const useLive = opts.useLive ?? process.env.WEATHER_USE_LIVE !== "false";

  if (!useLive) {
    return getFixtureWeather(booking.bookingId, {
      date: booking.date,
      timeRange: booking.time,
    });
  }

  const fallback = (reason: string) =>
    getFixtureWeather(booking.bookingId, {
      date: booking.date,
      timeRange: booking.time,
      fallbackReason: reason,
    });

  try {
    const res = await fetch(buildOpenMeteoUrl(booking), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      return fallback(`Open-Meteo が HTTP ${res.status} を返しました`);
    }

    const json = (await res.json()) as { hourly?: OpenMeteoHourly };
    const summary = summariseHourly(json.hourly ?? {}, booking);

    if (!summary) {
      return fallback(
        "予報範囲外、または該当時間帯のデータが取得できませんでした（Open-Meteo は約16日先までしか提供しません）",
      );
    }

    return {
      ...summary,
      source: "open-meteo",
      fetchedAt: new Date().toISOString(),
      degraded: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fallback(`Open-Meteo への接続に失敗しました: ${message}`);
  }
}
