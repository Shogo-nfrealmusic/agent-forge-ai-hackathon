import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOpenMeteoUrl,
  getWeatherForBooking,
  parseTimeRange,
  summariseHourly,
} from "@/lib/weather/open-meteo";
import { findBooking } from "@/lib/fixtures/bookings";
import type { Booking } from "@/lib/types";

const booking = findBooking("demo-booking-001") as Booking;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseTimeRange", () => {
  it("parses a whole-hour range", () => {
    expect(parseTimeRange("13:00-14:00")).toEqual([13, 13]);
  });

  it("includes the trailing hour for a partial end time", () => {
    expect(parseTimeRange("10:00-11:30")).toEqual([10, 11]);
  });

  it("returns null for garbage", () => {
    expect(parseTimeRange("そのうち")).toBeNull();
    expect(parseTimeRange("")).toBeNull();
  });
});

describe("summariseHourly", () => {
  const hourly = {
    time: ["2026-08-10T12:00", "2026-08-10T13:00", "2026-08-10T14:00"],
    precipitation_probability: [10, 72, 90],
    precipitation: [0, 1.5, 4],
    wind_speed_10m: [5, 11, 40],
    wind_gusts_10m: [8, 17, 60],
    temperature_2m: [30, 31, 29],
    weather_code: [1, 61, 95],
  };

  it("only aggregates hours inside the booking window", () => {
    const summary = summariseHourly(hourly, { date: "2026-08-10", time: "13:00-14:00" });
    expect(summary).not.toBeNull();
    // 13:00 slot only — the 14:00 storm is after the shoot ends.
    expect(summary?.precipitationProbabilityMax).toBe(72);
    expect(summary?.windSpeedMaxKmh).toBe(11);
    expect(summary?.weatherCodes).toEqual([61]);
  });

  it("returns null when the date is not present in the forecast", () => {
    expect(summariseHourly(hourly, { date: "2027-01-01", time: "13:00-14:00" })).toBeNull();
  });

  it("returns null for empty payloads", () => {
    expect(summariseHourly({}, { date: "2026-08-10", time: "13:00-14:00" })).toBeNull();
  });

  it("tolerates null values inside the arrays", () => {
    const summary = summariseHourly(
      {
        time: ["2026-08-10T13:00"],
        precipitation_probability: [null],
        wind_speed_10m: [null],
        weather_code: [null],
      },
      { date: "2026-08-10", time: "13:00-14:00" },
    );
    expect(summary?.precipitationProbabilityMax).toBe(0);
    expect(summary?.weatherCodes).toEqual([]);
  });
});

describe("buildOpenMeteoUrl", () => {
  it("requests only the booking date and includes no credentials", () => {
    const url = buildOpenMeteoUrl(booking);
    expect(url).toContain("start_date=2026-08-10");
    expect(url).toContain("end_date=2026-08-10");
    expect(url).toContain("wind_speed_unit=kmh");
    expect(url.toLowerCase()).not.toContain("key");
    expect(url.toLowerCase()).not.toContain("token");
  });
});

describe("getWeatherForBooking — fallback behaviour", () => {
  it("uses fixture data when live fetch is disabled", async () => {
    const weather = await getWeatherForBooking(booking, { useLive: false });
    expect(weather.source).toBe("fixture");
    expect(weather.degraded).toBe(false);
  });

  it("falls back to fixture when the network call throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ENOTFOUND api.open-meteo.com")),
    );
    const weather = await getWeatherForBooking(booking, { useLive: true });
    expect(weather.source).toBe("fixture");
    expect(weather.degraded).toBe(true);
    expect(weather.fallbackReason).toContain("接続に失敗");
  });

  it("falls back to fixture on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const weather = await getWeatherForBooking(booking, { useLive: true });
    expect(weather.source).toBe("fixture");
    expect(weather.degraded).toBe(true);
    expect(weather.fallbackReason).toContain("503");
  });

  it("falls back when the response has no usable hours (out of forecast range)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hourly: { time: [] } }) }),
    );
    const weather = await getWeatherForBooking(booking, { useLive: true });
    expect(weather.source).toBe("fixture");
    expect(weather.degraded).toBe(true);
    expect(weather.fallbackReason).toContain("予報範囲外");
  });

  it("falls back when the response body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      }),
    );
    const weather = await getWeatherForBooking(booking, { useLive: true });
    expect(weather.source).toBe("fixture");
    expect(weather.degraded).toBe(true);
  });

  it("uses live data when the API answers correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hourly: {
            time: ["2026-08-10T13:00"],
            precipitation_probability: [88],
            precipitation: [6],
            wind_speed_10m: [15],
            wind_gusts_10m: [22],
            temperature_2m: [27],
            weather_code: [65],
          },
        }),
      }),
    );
    const weather = await getWeatherForBooking(booking, { useLive: true });
    expect(weather.source).toBe("open-meteo");
    expect(weather.degraded).toBe(false);
    expect(weather.precipitationProbabilityMax).toBe(88);
  });
});
