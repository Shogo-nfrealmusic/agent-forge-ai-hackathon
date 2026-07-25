import { z } from "zod";
import type { HourlyPoint } from "@/lib/types";

/**
 * Prompt + assembly + validation for the model-written analysis script.
 *
 * The contract is deliberately narrow: the model returns only *which hours to
 * consider*, never the numbers. Every figure shown to a staff member is
 * recomputed on our side from the real forecast (see windows/index.ts), so a
 * hallucinating — or compromised — sandbox cannot invent a nice-looking
 * forecast. The sandbox does the reasoning; we keep the arithmetic.
 */

export const SANDBOX_SYSTEM_PROMPT = `You write small, dependency-free Python 3 analysis functions.

You will be given hourly weather data for one day and the length of an outdoor photo shoot.
Write a function that ranks the possible start hours for that shoot, best first.

Requirements:
- Define exactly one function: analyze(hours, duration_minutes, booking_start_hour)
- "hours" is a list of dicts with keys: hour (int), precipitationProbability (int),
  precipitationMm (float), windSpeedKmh (float), windGustKmh (float),
  temperatureC (float), weatherCode (int)
- A shoot occupies ceil(duration_minutes / 60) consecutive hours, all of which must exist in "hours"
- Rank candidate start hours from best to worst. Consider: rain probability, wind speed and gusts,
  and thunderstorm codes (95, 96, 99), which should be treated as disqualifying
- Return a dict exactly like:
    {"bestStartHour": <int or None>, "rankedStartHours": [<int>, ...]}
- "rankedStartHours" excludes booking_start_hour and holds at most 5 entries
- "bestStartHour" is the top alternative, or None if none is clearly better than
  the currently booked window
- Use only the Python standard library, and only the "math" module if you need one
- Do not import os, sys, subprocess, socket, shutil, pathlib, requests or urllib
- Do not read or write files, do not access the network, do not print anything
- Output ONLY the Python code for the function. No prose, no markdown fences.`;

export function buildSandboxUserPrompt(durationMinutes: number, bookingStartHour: number): string {
  return `The shoot is ${durationMinutes} minutes long and is currently booked to start at ${String(
    bookingStartHour,
  ).padStart(2, "0")}:00.

Write analyze(hours, duration_minutes, booking_start_hour) as specified. Output only the code.`;
}

/** Imports and builtins the generated script must not touch. */
const FORBIDDEN_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(?:import|from)\s+(?:os|sys|subprocess|socket|shutil|pathlib|requests|urllib|http|ftplib|smtplib|pickle|ctypes|multiprocessing)\b/, label: "a forbidden module import" },
  { pattern: /\b__import__\s*\(/, label: "__import__" },
  { pattern: /\beval\s*\(/, label: "eval()" },
  { pattern: /\bexec\s*\(/, label: "exec()" },
  { pattern: /\bopen\s*\(/, label: "open()" },
  { pattern: /\bcompile\s*\(/, label: "compile()" },
  { pattern: /\bglobals\s*\(\)|\blocals\s*\(\)/, label: "globals()/locals()" },
];

export interface CodeCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Static check on the generated code before it is even sent to the sandbox.
 *
 * The sandbox is the real boundary; this is defence in depth, and it keeps
 * obviously-wrong output (prose, markdown, a script that does I/O) from burning
 * a sandbox launch.
 */
export function checkGeneratedCode(code: string): CodeCheck {
  const trimmed = code.trim();

  if (trimmed.length === 0) return { ok: false, reason: "The model returned no code" };
  if (trimmed.length > 8000) return { ok: false, reason: "The generated code is implausibly long" };
  if (!/def\s+analyze\s*\(/.test(trimmed)) {
    return { ok: false, reason: "The generated code does not define analyze(...)" };
  }

  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, reason: `The generated code uses ${label}, which is not allowed` };
    }
  }

  return { ok: true };
}

/** Strip ``` fences the model may have added despite the instruction. */
export function stripCodeFences(raw: string): string {
  const fenced = raw.match(/```(?:python)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? raw).trim();
}

/**
 * Wrap the generated function in our own harness. The harness — not the model —
 * owns reading the input and printing the output, so the result is always
 * parseable regardless of what the model wrote.
 */
export function assembleSandboxScript(
  generatedCode: string,
  hours: HourlyPoint[],
  durationMinutes: number,
  bookingStartHour: number,
): string {
  const payload = JSON.stringify(
    hours.map((h) => ({
      hour: h.hour,
      precipitationProbability: h.precipitationProbability,
      precipitationMm: h.precipitationMm,
      windSpeedKmh: h.windSpeedKmh,
      windGustKmh: h.windGustKmh,
      temperatureC: h.temperatureC,
      weatherCode: h.weatherCode,
    })),
  );

  return `import json

HOURS = json.loads(r'''${payload}''')
DURATION_MINUTES = ${durationMinutes}
BOOKING_START_HOUR = ${bookingStartHour}

# ---- model-generated analysis below ----
${generatedCode}
# ---- harness (not model-generated) ----

_result = analyze(HOURS, DURATION_MINUTES, BOOKING_START_HOUR)
print("<<<RESULT>>>" + json.dumps(_result) + "<<<END>>>")
`;
}

/**
 * The sandbox only returns start hours. Everything numeric is recomputed on our
 * side, so this schema is intentionally tiny.
 */
export const sandboxResultSchema = z.object({
  bestStartHour: z.number().int().min(0).max(23).nullable(),
  rankedStartHours: z.array(z.number().int().min(0).max(23)).max(24),
});

export type SandboxResult = z.infer<typeof sandboxResultSchema>;

export interface ParsedSandboxResult {
  ok: boolean;
  data?: SandboxResult;
  error?: string;
}

/** Pull our sentinel-delimited JSON out of the sandbox stdout and validate it. */
export function parseSandboxOutput(stdout: string): ParsedSandboxResult {
  const match = stdout.match(/<<<RESULT>>>([\s\S]*?)<<<END>>>/);
  if (!match) {
    return { ok: false, error: "The sandbox produced no result marker" };
  }

  let json: unknown;
  try {
    json = JSON.parse(match[1]);
  } catch {
    return { ok: false, error: "The sandbox result was not valid JSON" };
  }

  const parsed = sandboxResultSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `The sandbox result does not match the schema - ${issues}` };
  }

  return { ok: true, data: parsed.data };
}
