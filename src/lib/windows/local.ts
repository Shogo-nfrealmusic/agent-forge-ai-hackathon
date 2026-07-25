import type { HourlyPoint, RiskLevel, ShootingWindow } from "@/lib/types";
import { THRESHOLDS, isThunderstormCode } from "@/lib/risk/rules";
import { formatHour } from "@/lib/weather/hourly";

/**
 * Trusted, hand-written window analysis.
 *
 * This is what runs when no Daytona sandbox is available. It is deliberately
 * NOT the AI's code — we never execute generated code outside a sandbox, so the
 * fallback has to be our own implementation.
 *
 * It is also the reference the sandbox result is validated against: the sandbox
 * output must be a real window from the same forecast, or it is rejected.
 */

/** Lower is better. Mirrors the deterministic rule thresholds. */
export function scoreWindow(hours: HourlyPoint[]): number {
  if (hours.length === 0) return Number.POSITIVE_INFINITY;

  const pop = Math.max(...hours.map((h) => h.precipitationProbability));
  const wind = Math.max(...hours.map((h) => Math.max(h.windSpeedKmh, h.windGustKmh)));
  const thunder = hours.some((h) => isThunderstormCode(h.weatherCode));

  let score = pop;
  if (wind >= THRESHOLDS.windHighKmh) score += 100;
  else score += Math.max(0, wind - 20) * 2;
  if (thunder) score += 200;

  return Math.round(score * 10) / 10;
}

export function riskLevelForWindow(hours: HourlyPoint[]): RiskLevel {
  const pop = Math.max(...hours.map((h) => h.precipitationProbability));
  const wind = Math.max(...hours.map((h) => Math.max(h.windSpeedKmh, h.windGustKmh)));
  const thunder = hours.some((h) => isThunderstormCode(h.weatherCode));

  if (thunder || wind >= THRESHOLDS.windHighKmh || pop >= THRESHOLDS.precipProbHigh) return "high";
  if (pop >= THRESHOLDS.precipProbMedium) return "medium";
  return "low";
}

function toWindow(hours: HourlyPoint[]): ShootingWindow {
  const first = hours[0];
  const last = hours[hours.length - 1];
  return {
    start: first.time,
    end: formatHour(last.hour + 1),
    precipitationProbabilityMax: Math.max(...hours.map((h) => h.precipitationProbability)),
    windSpeedMaxKmh: Math.max(...hours.map((h) => Math.max(h.windSpeedKmh, h.windGustKmh))),
    temperatureC:
      Math.round((hours.reduce((a, h) => a + h.temperatureC, 0) / hours.length) * 10) / 10,
    score: scoreWindow(hours),
    riskLevel: riskLevelForWindow(hours),
  };
}

/** Number of whole hour slots a booking occupies (minimum 1). */
export function slotsForDuration(durationMinutes: number): number {
  return Math.max(1, Math.ceil(durationMinutes / 60));
}

/** Every contiguous window of the required length, scored. */
export function enumerateWindows(
  hours: HourlyPoint[],
  durationMinutes: number,
): ShootingWindow[] {
  const slots = slotsForDuration(durationMinutes);
  if (hours.length < slots) return [];

  const windows: ShootingWindow[] = [];
  for (let i = 0; i + slots <= hours.length; i++) {
    const chunk = hours.slice(i, i + slots);
    // Skip non-contiguous runs (a gap in the forecast data).
    const contiguous = chunk.every((h, k) => k === 0 || h.hour === chunk[k - 1].hour + 1);
    if (contiguous) windows.push(toWindow(chunk));
  }
  return windows;
}

export function findWindowStartingAt(
  hours: HourlyPoint[],
  startHour: number,
  durationMinutes: number,
): ShootingWindow | null {
  return (
    enumerateWindows(hours, durationMinutes).find(
      (w) => Number(w.start.slice(0, 2)) === startHour,
    ) ?? null
  );
}

export interface LocalWindowAnalysis {
  current: ShootingWindow | null;
  best: ShootingWindow | null;
  alternatives: ShootingWindow[];
}

/**
 * Rank same-day alternatives. `best` is only set when it is meaningfully better
 * than the booked window — "we found a slot 2 points better" is not worth
 * emailing a customer about.
 */
export function analyseWindowsLocally(
  hours: HourlyPoint[],
  bookingStartHour: number,
  durationMinutes: number,
  opts: { minimumImprovement?: number; maxAlternatives?: number } = {},
): LocalWindowAnalysis {
  const minimumImprovement = opts.minimumImprovement ?? 15;
  const maxAlternatives = opts.maxAlternatives ?? 3;

  const all = enumerateWindows(hours, durationMinutes);
  if (all.length === 0) return { current: null, best: null, alternatives: [] };

  const current = all.find((w) => Number(w.start.slice(0, 2)) === bookingStartHour) ?? null;

  const others = all
    .filter((w) => Number(w.start.slice(0, 2)) !== bookingStartHour)
    .sort((a, b) => a.score - b.score);

  const best =
    current && others.length > 0 && current.score - others[0].score >= minimumImprovement
      ? others[0]
      : null;

  return { current, best, alternatives: others.slice(0, maxAlternatives) };
}
