import { describe, expect, it } from "vitest";
import { extractJsonObject, parseAiResponse } from "@/lib/ai/schema";

const VALID = {
  riskLevel: "medium",
  summary: "Chance of rain is somewhat elevated",
  recommendation: "plan_change",
  customerMessage: "We would like to suggest a covered location.",
  confidence: 0.7,
  requiresHumanReview: true,
};

describe("extractJsonObject", () => {
  it("parses a bare JSON object", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses a ```json fenced object", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("parses an object surrounded by prose", () => {
    expect(extractJsonObject('Sure, here it is:\n{"a":1}\nThat is all.')).toEqual({ a: 1 });
  });

  it("returns null for unparseable input", () => {
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject("{broken:")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });
});

describe("parseAiResponse — malformed input is handled safely", () => {
  it.each([
    ["empty string", ""],
    ["prose only", "I cannot determine this"],
    ["truncated JSON", '{"riskLevel":"high","summary":'],
    ["array instead of object", "[1,2,3]"],
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
    ["missing required fields", '{"riskLevel":"high"}'],
    ["unknown enum value", JSON.stringify({ ...VALID, riskLevel: "catastrophic" })],
    ["unknown recommendation", JSON.stringify({ ...VALID, recommendation: "cancel_booking" })],
    ["confidence out of range", JSON.stringify({ ...VALID, confidence: 700 })],
    ["negative confidence", JSON.stringify({ ...VALID, confidence: -1 })],
    ["non-numeric confidence", JSON.stringify({ ...VALID, confidence: "high" })],
    ["wrong type for summary", JSON.stringify({ ...VALID, summary: { text: "x" } })],
    ["empty customerMessage", JSON.stringify({ ...VALID, customerMessage: "   " })],
  ])("rejects %s without throwing", (_name, input) => {
    const result = parseAiResponse(input);
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it("never throws on deeply weird input", () => {
    expect(() => parseAiResponse({ toString: null })).not.toThrow();
    expect(() => parseAiResponse(Symbol("x") as unknown)).not.toThrow();
  });
});

describe("parseAiResponse — normalisation of common model quirks", () => {
  it("accepts uppercase enum values", () => {
    const result = parseAiResponse(JSON.stringify({ ...VALID, riskLevel: "HIGH" }));
    expect(result.ok).toBe(true);
    expect(result.data?.riskLevel).toBe("high");
  });

  it("accepts a hyphenated recommendation", () => {
    const result = parseAiResponse(JSON.stringify({ ...VALID, recommendation: "Plan-Change" }));
    expect(result.ok).toBe(true);
    expect(result.data?.recommendation).toBe("plan_change");
  });

  it("accepts confidence as a numeric string", () => {
    const result = parseAiResponse(JSON.stringify({ ...VALID, confidence: "0.42" }));
    expect(result.ok).toBe(true);
    expect(result.data?.confidence).toBeCloseTo(0.42);
  });

  it("converts a percentage confidence to a 0-1 ratio", () => {
    const result = parseAiResponse(JSON.stringify({ ...VALID, confidence: 85 }));
    expect(result.ok).toBe(true);
    expect(result.data?.confidence).toBeCloseTo(0.85);
  });

  it("forces requiresHumanReview to true", () => {
    const result = parseAiResponse(JSON.stringify({ ...VALID, requiresHumanReview: false }));
    expect(result.ok).toBe(true);
    expect(result.data?.requiresHumanReview).toBe(true);
  });

  it("accepts a fully valid response unchanged", () => {
    const result = parseAiResponse(JSON.stringify(VALID));
    expect(result.ok).toBe(true);
    expect(result.data?.recommendation).toBe("plan_change");
  });
});
