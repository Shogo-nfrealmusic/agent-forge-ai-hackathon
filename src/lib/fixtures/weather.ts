import type { WeatherSummary } from "@/lib/types";

/**
 * Fixture weather, keyed by bookingId.
 *
 * Used (a) as the offline demo path and (b) as the fallback whenever the live
 * weather API fails, times out, or the booking date is outside its forecast
 * horizon. The demo therefore never shows a broken screen.
 */
type FixtureWeather = Omit<WeatherSummary, "source" | "fetchedAt" | "degraded" | "fallbackReason">;

const FIXTURES: Record<string, FixtureWeather> = {
  "demo-booking-001": {
    date: "2026-08-10",
    timeRange: "13:00-14:00",
    precipitationProbabilityMax: 10,
    precipitationMm: 0,
    windSpeedMaxKmh: 12,
    windGustMaxKmh: 19,
    temperatureC: 31,
    weatherCodes: [1],
    conditionLabel: "Mostly sunny",
    alerts: [],
  },
  "demo-booking-002": {
    date: "2026-08-11",
    timeRange: "10:00-11:30",
    precipitationProbabilityMax: 65,
    precipitationMm: 1.2,
    windSpeedMaxKmh: 18,
    windGustMaxKmh: 26,
    temperatureC: 28,
    weatherCodes: [3, 61],
    conditionLabel: "Cloudy with light rain at times",
    alerts: [],
  },
  "demo-booking-003": {
    date: "2026-08-12",
    timeRange: "16:00-17:00",
    precipitationProbabilityMax: 75,
    precipitationMm: 3.4,
    windSpeedMaxKmh: 20,
    windGustMaxKmh: 28,
    temperatureC: 27,
    weatherCodes: [63],
    conditionLabel: "Rain",
    alerts: [],
  },
  "demo-booking-004": {
    date: "2026-08-13",
    timeRange: "09:00-10:00",
    precipitationProbabilityMax: 85,
    precipitationMm: 7.8,
    windSpeedMaxKmh: 22,
    windGustMaxKmh: 29,
    temperatureC: 26,
    weatherCodes: [65],
    conditionLabel: "Heavy rain",
    alerts: [],
  },
  "demo-booking-005": {
    date: "2026-08-14",
    timeRange: "15:00-16:00",
    precipitationProbabilityMax: 60,
    precipitationMm: 5.1,
    windSpeedMaxKmh: 24,
    windGustMaxKmh: 29,
    temperatureC: 30,
    weatherCodes: [95],
    conditionLabel: "Thunderstorm",
    alerts: [],
  },
  "demo-booking-006": {
    date: "2026-08-15",
    timeRange: "11:00-12:00",
    precipitationProbabilityMax: 55,
    precipitationMm: 4.0,
    windSpeedMaxKmh: 42,
    windGustMaxKmh: 61,
    temperatureC: 29,
    weatherCodes: [3, 80],
    conditionLabel: "Strong wind with showers",
    alerts: ["Storm warning — approaching typhoon (mock)"],
  },
  // Fallback only — this booking normally resolves through the live API.
  "demo-booking-007": {
    date: "2026-07-28",
    timeRange: "14:00-15:00",
    precipitationProbabilityMax: 35,
    precipitationMm: 0.4,
    windSpeedMaxKmh: 16,
    windGustMaxKmh: 24,
    temperatureC: 33,
    weatherCodes: [2],
    conditionLabel: "Partly cloudy",
    alerts: [],
  },
  // Clear-weather days for the triage demo.
  "demo-booking-008": {
    date: "2026-08-16", timeRange: "09:00-10:00",
    precipitationProbabilityMax: 10, precipitationMm: 0,
    windSpeedMaxKmh: 9, windGustMaxKmh: 14, temperatureC: 29,
    weatherCodes: [1], conditionLabel: "Mostly sunny", alerts: [],
  },
  "demo-booking-009": {
    date: "2026-08-17", timeRange: "17:00-18:00",
    precipitationProbabilityMax: 20, precipitationMm: 0,
    windSpeedMaxKmh: 12, windGustMaxKmh: 18, temperatureC: 30,
    weatherCodes: [2], conditionLabel: "Partly cloudy", alerts: [],
  },
  "demo-booking-010": {
    date: "2026-08-18", timeRange: "10:00-11:00",
    precipitationProbabilityMax: 5, precipitationMm: 0,
    windSpeedMaxKmh: 8, windGustMaxKmh: 12, temperatureC: 28,
    weatherCodes: [0], conditionLabel: "Clear sky", alerts: [],
  },
  "demo-booking-011": {
    date: "2026-08-19", timeRange: "13:00-14:30",
    precipitationProbabilityMax: 30, precipitationMm: 0.2,
    windSpeedMaxKmh: 15, windGustMaxKmh: 21, temperatureC: 31,
    weatherCodes: [2], conditionLabel: "Partly cloudy", alerts: [],
  },
};

/** Neutral default for a bookingId with no dedicated fixture. */
const DEFAULT_FIXTURE: FixtureWeather = {
  date: "",
  timeRange: "",
  precipitationProbabilityMax: 20,
  precipitationMm: 0,
  windSpeedMaxKmh: 14,
  windGustMaxKmh: 20,
  temperatureC: 25,
  weatherCodes: [2],
  conditionLabel: "Partly cloudy (default fixture)",
  alerts: [],
};

export function getFixtureWeather(
  bookingId: string,
  opts: { date?: string; timeRange?: string; fallbackReason?: string } = {},
): WeatherSummary {
  const base = FIXTURES[bookingId] ?? DEFAULT_FIXTURE;
  return {
    ...base,
    date: base.date || opts.date || "",
    timeRange: base.timeRange || opts.timeRange || "",
    source: "fixture",
    fetchedAt: new Date().toISOString(),
    degraded: Boolean(opts.fallbackReason),
    fallbackReason: opts.fallbackReason,
  };
}

export function hasFixtureWeather(bookingId: string): boolean {
  return bookingId in FIXTURES;
}
