import { afterEach, describe, expect, it, vi } from "vitest";
import type { Booking, DayForecast, HourlyPoint } from "@/lib/types";
import { findBooking } from "@/lib/fixtures/bookings";
import { buildFixtureDayHourly, parseDayHourly } from "@/lib/weather/hourly";
import {
  analyseWindowsLocally,
  enumerateWindows,
  findWindowStartingAt,
  riskLevelForWindow,
  scoreWindow,
  slotsForDuration,
} from "@/lib/windows/local";
import {
  assembleSandboxScript,
  checkGeneratedCode,
  parseSandboxOutput,
  stripCodeFences,
} from "@/lib/windows/codegen";
import { analyseWindows, analyseWindowsLocal } from "@/lib/windows";
import { runPythonInSandbox } from "@/lib/sandbox/daytona";

const booking = findBooking("demo-booking-004") as Booking; // 09:00-10:00, 60 min

function hour(h: number, over: Partial<HourlyPoint> = {}): HourlyPoint {
  return {
    hour: h,
    time: `${String(h).padStart(2, "0")}:00`,
    precipitationProbability: 10,
    precipitationMm: 0,
    windSpeedKmh: 10,
    windGustKmh: 14,
    temperatureC: 25,
    weatherCode: 2,
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hourly forecast parsing", () => {
  it("keeps only daylight hours for the requested date", () => {
    const points = parseDayHourly(
      {
        time: ["2026-08-13T03:00", "2026-08-13T09:00", "2026-08-13T22:00", "2026-08-14T09:00"],
        precipitation_probability: [10, 85, 20, 30],
      },
      "2026-08-13",
    );
    expect(points.map((p) => p.hour)).toEqual([9]);
    expect(points[0].precipitationProbability).toBe(85);
  });

  it("returns an empty array for an unrelated date", () => {
    expect(parseDayHourly({ time: ["2026-08-13T09:00"] }, "2027-01-01")).toEqual([]);
  });

  it("builds a deterministic fixture day curve peaking at the booking hour", () => {
    const a = buildFixtureDayHourly(booking);
    const b = buildFixtureDayHourly(booking);
    expect(a).toEqual(b); // deterministic — no randomness

    const at9 = a.find((h) => h.hour === 9);
    const at16 = a.find((h) => h.hour === 16);
    expect(at9?.precipitationProbability).toBe(85);
    // Far from the peak the forecast improves, so an alternative exists.
    expect(at16!.precipitationProbability).toBeLessThan(at9!.precipitationProbability);
  });
});

describe("window scoring and enumeration", () => {
  it("counts whole hour slots, rounding up", () => {
    expect(slotsForDuration(60)).toBe(1);
    expect(slotsForDuration(90)).toBe(2);
    expect(slotsForDuration(30)).toBe(1);
  });

  it("scores a wet window worse than a dry one", () => {
    expect(scoreWindow([hour(9, { precipitationProbability: 85 })])).toBeGreaterThan(
      scoreWindow([hour(16, { precipitationProbability: 10 })]),
    );
  });

  it("heavily penalises thunderstorms and strong wind", () => {
    expect(scoreWindow([hour(9, { weatherCode: 95 })])).toBeGreaterThan(200);
    expect(scoreWindow([hour(9, { windSpeedKmh: 40 })])).toBeGreaterThan(100);
  });

  it("classifies window risk with the same thresholds as the rule engine", () => {
    expect(riskLevelForWindow([hour(9, { precipitationProbability: 85 })])).toBe("high");
    expect(riskLevelForWindow([hour(9, { precipitationProbability: 75 })])).toBe("medium");
    expect(riskLevelForWindow([hour(9, { precipitationProbability: 20 })])).toBe("low");
    expect(riskLevelForWindow([hour(9, { weatherCode: 99 })])).toBe("high");
    expect(riskLevelForWindow([hour(9, { windGustKmh: 55 })])).toBe("high");
  });

  it("enumerates multi-hour windows and reports the correct end time", () => {
    const hours = [hour(9), hour(10), hour(11)];
    const windows = enumerateWindows(hours, 90); // 2 slots
    expect(windows).toHaveLength(2);
    expect(windows[0].start).toBe("09:00");
    expect(windows[0].end).toBe("11:00");
  });

  it("does not span a gap in the forecast", () => {
    const hours = [hour(9), hour(14)]; // not contiguous
    expect(enumerateWindows(hours, 120)).toHaveLength(0);
  });

  it("returns nothing when the day is shorter than the booking", () => {
    expect(enumerateWindows([hour(9)], 180)).toEqual([]);
  });
});

describe("local (trusted) window analysis", () => {
  const hours = [
    hour(9, { precipitationProbability: 85 }),
    hour(10, { precipitationProbability: 70 }),
    hour(15, { precipitationProbability: 60 }),
    hour(16, { precipitationProbability: 10 }),
  ];

  it("identifies the currently booked window", () => {
    const { current } = analyseWindowsLocally(hours, 9, 60);
    expect(current?.start).toBe("09:00");
    expect(current?.precipitationProbabilityMax).toBe(85);
  });

  it("suggests a meaningfully better slot", () => {
    const { best } = analyseWindowsLocally(hours, 9, 60);
    expect(best?.start).toBe("16:00");
    expect(best?.riskLevel).toBe("low");
  });

  it("suggests nothing when no slot is meaningfully better", () => {
    const flat = [hour(9, { precipitationProbability: 40 }), hour(10, { precipitationProbability: 38 })];
    expect(analyseWindowsLocally(flat, 9, 60).best).toBeNull();
  });

  it("never offers the booked window as an alternative", () => {
    const { alternatives } = analyseWindowsLocally(hours, 9, 60);
    expect(alternatives.every((w) => w.start !== "09:00")).toBe(true);
  });

  it("finds a window by its start hour", () => {
    expect(findWindowStartingAt(hours, 16, 60)?.start).toBe("16:00");
    expect(findWindowStartingAt(hours, 3, 60)).toBeNull();
  });
});

describe("generated-code safety checks", () => {
  const good = `def analyze(hours, duration_minutes, booking_start_hour):
    return {"bestStartHour": None, "rankedStartHours": []}`;

  it("accepts a well-formed function", () => {
    expect(checkGeneratedCode(good).ok).toBe(true);
  });

  it("rejects code that does not define analyze()", () => {
    expect(checkGeneratedCode("print('hi')").ok).toBe(false);
  });

  it("rejects empty output", () => {
    expect(checkGeneratedCode("   ").ok).toBe(false);
  });

  it.each([
    ["os import", "import os\n" + good],
    ["subprocess import", "from subprocess import run\n" + good],
    ["socket import", "import socket\n" + good],
    ["urllib import", "import urllib.request\n" + good],
    ["eval", good + "\neval('1+1')"],
    ["exec", good + "\nexec('x=1')"],
    ["open", good + "\nopen('/etc/passwd')"],
    ["__import__", good + "\n__import__('os')"],
  ])("rejects %s", (_name, code) => {
    const check = checkGeneratedCode(code);
    expect(check.ok).toBe(false);
    expect(check.reason).toBeTruthy();
  });

  it("strips markdown fences the model may have added", () => {
    expect(stripCodeFences("```python\ndef analyze():\n    pass\n```")).toBe(
      "def analyze():\n    pass",
    );
  });
});

describe("sandbox script assembly and output parsing", () => {
  it("owns the input and the output, not the model", () => {
    const script = assembleSandboxScript("def analyze(a,b,c):\n    return {}", [hour(9)], 60, 9);
    expect(script).toContain("HOURS = json.loads");
    expect(script).toContain("DURATION_MINUTES = 60");
    expect(script).toContain("BOOKING_START_HOUR = 9");
    expect(script).toContain("<<<RESULT>>>");
    // The harness, not the model, prints the result.
    expect(script.indexOf("_result = analyze(")).toBeGreaterThan(
      script.indexOf("def analyze(a,b,c)"),
    );
  });

  it("parses a valid sandbox result", () => {
    const parsed = parseSandboxOutput(
      'noise\n<<<RESULT>>>{"bestStartHour":16,"rankedStartHours":[16,15]}<<<END>>>\n',
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.data?.bestStartHour).toBe(16);
  });

  it.each([
    ["no marker", "just some output"],
    ["invalid JSON", "<<<RESULT>>>{not json}<<<END>>>"],
    ["wrong shape", '<<<RESULT>>>{"bestStartHour":"afternoon"}<<<END>>>'],
    ["hour out of range", '<<<RESULT>>>{"bestStartHour":99,"rankedStartHours":[]}<<<END>>>'],
    ["empty", ""],
  ])("safely rejects %s", (_name, output) => {
    const parsed = parseSandboxOutput(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBeTruthy();
  });
});

describe("runPythonInSandbox", () => {
  it("does nothing without an API key", async () => {
    const result = await runPythonInSandbox("print(1)", { apiKey: null });
    expect(result.ok).toBe(false);
    expect(result.errorReason).toContain("DAYTONA_API_KEY");
  });

  it("refuses to launch a sandbox for empty code", async () => {
    const result = await runPythonInSandbox("   ", { apiKey: "test-key" });
    expect(result.ok).toBe(false);
    expect(result.errorReason).toContain("empty code");
  });
});

describe("analyseWindows — orchestration and fallback", () => {
  const forecast: DayForecast = {
    source: "fixture",
    degraded: false,
    date: booking.date,
    hours: buildFixtureDayHourly(booking),
  };

  it("uses the trusted local path when no AI provider is configured", async () => {
    const analysis = await analyseWindows(booking, forecast, { provider: null });
    expect(analysis?.source).toBe("local-trusted");
    expect(analysis?.generatedCode).toBeNull();
    expect(analysis?.fallbackReason).toContain("No AI provider");
  });

  it("never returns generated code on the local path", async () => {
    const analysis = analyseWindowsLocal(booking, forecast);
    expect(analysis.source).toBe("local-trusted");
    expect(analysis.generatedCode).toBeNull();
  });

  it("returns null when the forecast has no hours", async () => {
    expect(
      await analyseWindows(booking, { ...forecast, hours: [] }, { provider: null }),
    ).toBeNull();
  });

  it("falls back to local when the model call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const analysis = await analyseWindows(booking, forecast, {
      provider: {
        id: "qwen-cloud",
        label: "Qwen Cloud",
        apiKey: "k",
        baseUrl: "https://example.invalid/v1",
        model: "m",
      },
    });
    expect(analysis?.source).toBe("local-trusted");
    expect(analysis?.fallbackReason).toContain("never run outside a sandbox");
  });

  it("falls back to local when the model returns unsafe code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "import os\ndef analyze(a,b,c):\n    return {}" } }],
        }),
      }),
    );
    const analysis = await analyseWindows(booking, forecast, {
      provider: {
        id: "qwen-cloud",
        label: "Qwen Cloud",
        apiKey: "k",
        baseUrl: "https://example.invalid/v1",
        model: "m",
      },
    });
    expect(analysis?.source).toBe("local-trusted");
    expect(analysis?.fallbackReason).toContain("forbidden module import");
  });

  it("still surfaces a usable current window on the local path", async () => {
    const analysis = await analyseWindows(booking, forecast, { provider: null });
    expect(analysis?.current?.start).toBe("09:00");
    // The fixture curve peaks at the booking hour, so a better slot exists.
    expect(analysis?.best).not.toBeNull();
  });
});
