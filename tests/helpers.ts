import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { WeatherSummary } from "@/lib/types";

export const SRC_DIR = path.join(process.cwd(), "src");
export const TESTS_DIR = path.join(process.cwd(), "tests");

/** Recursively list source files under `dir` with the given extensions. */
export async function listSourceFiles(
  dir: string = SRC_DIR,
  exts: string[] = [".ts", ".tsx"],
): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listSourceFiles(full, exts)));
    } else if (exts.includes(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every file that gets committed, including the tests themselves.
 *
 * The tests are committed to a public repository too, so a personal phone
 * number or an email pasted into a test case leaks exactly as badly as one in
 * `src/`. Scanning only `src/` once let a real number through in review.
 */
export async function readCommittedFiles(): Promise<
  { file: string; rel: string; content: string }[]
> {
  const files = [...(await listSourceFiles(SRC_DIR)), ...(await listSourceFiles(TESTS_DIR))];
  return Promise.all(
    files.map(async (file) => ({
      file,
      rel: path.relative(process.cwd(), file),
      content: await readFile(file, "utf8"),
    })),
  );
}

export async function readSourceFiles(): Promise<{ file: string; rel: string; content: string }[]> {
  const files = await listSourceFiles();
  return Promise.all(
    files.map(async (file) => ({
      file,
      rel: path.relative(process.cwd(), file),
      content: await readFile(file, "utf8"),
    })),
  );
}

/** Build a WeatherSummary for tests without repeating every field. */
export function makeWeather(overrides: Partial<WeatherSummary> = {}): WeatherSummary {
  return {
    source: "fixture",
    fetchedAt: "2026-07-25T00:00:00.000Z",
    degraded: false,
    date: "2026-08-10",
    timeRange: "13:00-14:00",
    precipitationProbabilityMax: 10,
    precipitationMm: 0,
    windSpeedMaxKmh: 10,
    windGustMaxKmh: 15,
    temperatureC: 28,
    weatherCodes: [1],
    conditionLabel: "Mostly sunny",
    alerts: [],
    ...overrides,
  };
}
