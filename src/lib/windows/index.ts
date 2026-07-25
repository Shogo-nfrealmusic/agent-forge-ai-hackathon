import type { Booking, DayForecast, ShootingWindow, WindowAnalysis } from "@/lib/types";
import { analyseWindowsLocally, findWindowStartingAt } from "@/lib/windows/local";
import {
  SANDBOX_SYSTEM_PROMPT,
  assembleSandboxScript,
  buildSandboxUserPrompt,
  checkGeneratedCode,
  parseSandboxOutput,
  stripCodeFences,
} from "@/lib/windows/codegen";
import { callChatCompletion } from "@/lib/ai/adapter";
import { readAiProviders, type AiProviderConfig } from "@/lib/ai/providers";
import { runPythonInSandbox } from "@/lib/sandbox/daytona";

/**
 * "Is there a better slot on the same day?"
 *
 * Two paths:
 *
 *   daytona-sandbox — the model writes a Python ranking function and it runs
 *                     inside a Daytona sandbox. Requires both an AI provider
 *                     and DAYTONA_API_KEY.
 *   local-trusted   — our own implementation. Used whenever the sandbox path is
 *                     unavailable or fails.
 *
 * Generated code is NEVER executed outside the sandbox. There is no local eval
 * path; the fallback is hand-written code.
 *
 * The sandbox only returns candidate start hours. Every number a staff member
 * sees is recomputed here from the real forecast, so the sandbox cannot invent
 * a favourable answer.
 */

const MAX_ALTERNATIVES = 3;

function bookingStartHour(booking: Booking): number {
  return Number(booking.time.slice(0, 2));
}

/** The trusted path. Never throws. */
export function analyseWindowsLocal(
  booking: Booking,
  forecast: DayForecast,
  fallbackReason?: string,
): WindowAnalysis {
  const { current, best, alternatives } = analyseWindowsLocally(
    forecast.hours,
    bookingStartHour(booking),
    booking.durationMinutes,
    { maxAlternatives: MAX_ALTERNATIVES },
  );

  return {
    source: "local-trusted",
    current,
    best,
    alternatives,
    fallbackReason,
    generatedCode: null,
  };
}

/**
 * The sandbox path. Never throws — returns null when it could not be used, so
 * the caller falls back to the trusted implementation.
 */
async function analyseWindowsInSandbox(
  booking: Booking,
  forecast: DayForecast,
  provider: AiProviderConfig,
): Promise<{ analysis: WindowAnalysis } | { error: string }> {
  const startHour = bookingStartHour(booking);

  // 1. Ask the model for the analysis function.
  let generatedCode: string;
  try {
    const { content } = await callChatCompletion(
      provider,
      [
        { role: "system", content: SANDBOX_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildSandboxUserPrompt(booking.durationMinutes, startHour),
        },
      ],
      { jsonMode: false, temperature: 0 },
    );
    generatedCode = stripCodeFences(content);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  // 2. Static check before we spend a sandbox on it.
  const check = checkGeneratedCode(generatedCode);
  if (!check.ok) return { error: check.reason ?? "The generated code was rejected" };

  // 3. Run it in Daytona — never here.
  const script = assembleSandboxScript(
    generatedCode,
    forecast.hours,
    booking.durationMinutes,
    startHour,
  );
  const run = await runPythonInSandbox(script);
  if (!run.ok) return { error: run.errorReason ?? "The sandbox run failed" };

  // 4. Validate the output shape.
  const parsed = parseSandboxOutput(run.output);
  if (!parsed.ok || !parsed.data) {
    return { error: parsed.error ?? "The sandbox output could not be parsed" };
  }

  // 5. Re-derive every number ourselves. Hours the sandbox invented, or that do
  //    not form a real window in this forecast, are simply dropped.
  const toWindow = (hour: number): ShootingWindow | null =>
    hour === startHour
      ? null
      : findWindowStartingAt(forecast.hours, hour, booking.durationMinutes);

  const alternatives = parsed.data.rankedStartHours
    .map(toWindow)
    .filter((w): w is ShootingWindow => w !== null)
    .slice(0, MAX_ALTERNATIVES);

  const current = findWindowStartingAt(forecast.hours, startHour, booking.durationMinutes);

  const bestCandidate =
    parsed.data.bestStartHour !== null ? toWindow(parsed.data.bestStartHour) : null;

  // Only surface a "better slot" if it really is better on our own scale.
  const best =
    bestCandidate && current && current.score - bestCandidate.score >= 15 ? bestCandidate : null;

  if (alternatives.length === 0 && best === null && current === null) {
    return { error: "The sandbox returned no usable windows" };
  }

  return {
    analysis: {
      source: "daytona-sandbox",
      current,
      best,
      alternatives,
      generatedCode,
      executionMs: run.durationMs,
    },
  };
}

/**
 * Entry point. Never throws; always returns an analysis (or null when the day
 * forecast has too few hours to work with).
 */
export async function analyseWindows(
  booking: Booking,
  forecast: DayForecast,
  opts: { provider?: AiProviderConfig | null } = {},
): Promise<WindowAnalysis | null> {
  if (forecast.hours.length === 0) return null;

  const provider =
    opts.provider !== undefined ? opts.provider : (readAiProviders()[0] ?? null);

  if (!provider) {
    return analyseWindowsLocal(
      booking,
      forecast,
      "No AI provider is configured, so no code was generated and the trusted local analysis was used.",
    );
  }

  const result = await analyseWindowsInSandbox(booking, forecast, provider);

  if ("analysis" in result) return result.analysis;

  return analyseWindowsLocal(
    booking,
    forecast,
    `${result.error} - fell back to the trusted local analysis (generated code is never run outside a sandbox).`,
  );
}
