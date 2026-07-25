import { z } from "zod";
import type { AiRecommendation } from "@/lib/types";

/**
 * Strict schema for AI output. Anything that does not validate is discarded and
 * the caller falls back to the mock adapter — a malformed model response must
 * never reach the UI or the audit log.
 */
export const aiRecommendationSchema = z.object({
  riskLevel: z.enum(["low", "medium", "high"]),
  summary: z.string().trim().min(1).max(600),
  recommendation: z.enum(["keep", "reschedule", "plan_change", "contact_staff"]),
  customerMessage: z.string().trim().min(1).max(2000),
  confidence: z.number().min(0).max(1),
  requiresHumanReview: z.boolean(),
});

/**
 * Pull the first JSON object out of a model response. Handles ```json fences
 * and leading/trailing prose. Returns null when nothing parseable is found.
 */
export function extractJsonObject(raw: string): unknown | null {
  if (typeof raw !== "string") return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], raw].filter(
    (c): c is string => typeof c === "string" && c.trim().length > 0,
  );

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) continue;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * Best-effort normalisation of common model quirks before strict validation:
 * casing on enums, numeric strings, "true"/"false" strings, 0-100 confidence.
 * Anything still off-shape is rejected by the schema.
 */
export function normalizeAiPayload(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
  const obj = { ...(input as Record<string, unknown>) };

  if (typeof obj.riskLevel === "string") obj.riskLevel = obj.riskLevel.trim().toLowerCase();
  if (typeof obj.recommendation === "string") {
    obj.recommendation = obj.recommendation.trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  if (typeof obj.confidence === "string") {
    const parsed = Number(obj.confidence);
    if (Number.isFinite(parsed)) obj.confidence = parsed;
  }
  // Some models answer with a percentage.
  if (typeof obj.confidence === "number" && obj.confidence > 1 && obj.confidence <= 100) {
    obj.confidence = obj.confidence / 100;
  }

  if (typeof obj.requiresHumanReview === "string") {
    const v = obj.requiresHumanReview.trim().toLowerCase();
    if (v === "true") obj.requiresHumanReview = true;
    if (v === "false") obj.requiresHumanReview = false;
  }

  return obj;
}

export interface ParseResult {
  ok: boolean;
  data?: AiRecommendation;
  error?: string;
}

/** Parse a raw model response (string or already-parsed object) safely. */
export function parseAiResponse(raw: unknown): ParseResult {
  const candidate = typeof raw === "string" ? extractJsonObject(raw) : raw;
  if (candidate === null || candidate === undefined) {
    return { ok: false, error: "Could not extract a JSON object from the AI response" };
  }

  const result = aiRecommendationSchema.safeParse(normalizeAiPayload(candidate));
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `The AI response does not match the schema - ${issues}` };
  }

  // Human review is non-negotiable in this prototype, whatever the model says.
  return { ok: true, data: { ...result.data, requiresHumanReview: true } };
}
