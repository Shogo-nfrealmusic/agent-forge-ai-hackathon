import { appendFile, mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { AuditEntry, StaffDecision } from "@/lib/types";

/**
 * Local, append-only audit log (JSONL on disk).
 *
 * IMPORTANT: recording a decision performs NO network I/O whatsoever. It does
 * not call a booking API, a payment API, a mail API or a calendar API. The only
 * side effect is appending one line to a local file.
 * Verified by tests/no-external-calls.test.ts.
 */

const DEFAULT_LOG_PATH = path.join(process.cwd(), ".data", "audit-log.jsonl");

function logPath(): string {
  return process.env.AUDIT_LOG_PATH?.trim() || DEFAULT_LOG_PATH;
}

const DECISION_NOTES: Record<StaffDecision, string> = {
  approved: "staff approved recommendation (no booking system call was made)",
  rejected: "staff rejected recommendation (no booking system call was made)",
  needs_discussion: "staff flagged for discussion / 要確認 (no booking system call was made)",
};

export const decisionInputSchema = z
  .object({
    bookingId: z.string().min(1),
    decision: z.enum(["approved", "rejected", "needs_discussion"]),
    reason: z.string().trim().max(2000).optional().nullable(),
    deterministicRiskLevel: z.enum(["low", "medium", "high"]),
    aiRiskLevel: z.enum(["low", "medium", "high"]),
    aiRecommendation: z.enum(["keep", "reschedule", "plan_change", "contact_staff"]),
    agreement: z.enum(["agree", "needs_check"]),
    weatherSource: z.enum(["open-meteo", "fixture"]),
    aiSource: z.enum(["live", "mock"]),
  })
  .refine(
    (v) => v.decision !== "rejected" || (v.reason != null && v.reason.trim().length > 0),
    { message: "Reject の場合は理由が必須です", path: ["reason"] },
  );

export type DecisionInput = z.infer<typeof decisionInputSchema>;

export async function recordDecision(input: DecisionInput): Promise<AuditEntry> {
  const parsed = decisionInputSchema.parse(input);

  const entry: AuditEntry = {
    id: randomUUID(),
    recordedAt: new Date().toISOString(),
    bookingId: parsed.bookingId,
    decision: parsed.decision,
    reason: parsed.reason?.trim() ? parsed.reason.trim() : null,
    deterministicRiskLevel: parsed.deterministicRiskLevel,
    aiRiskLevel: parsed.aiRiskLevel,
    aiRecommendation: parsed.aiRecommendation,
    agreement: parsed.agreement,
    weatherSource: parsed.weatherSource,
    aiSource: parsed.aiSource,
    bookingSystemMutated: false,
    note: DECISION_NOTES[parsed.decision],
  };

  const file = logPath();
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");

  return entry;
}

/** Newest first. Returns [] when the log does not exist yet. */
export async function readAuditLog(limit = 200): Promise<AuditEntry[]> {
  let raw: string;
  try {
    raw = await readFile(logPath(), "utf8");
  } catch {
    return [];
  }

  const entries: AuditEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as AuditEntry);
    } catch {
      // Skip corrupt lines rather than breaking the audit screen.
    }
  }

  return entries.reverse().slice(0, limit);
}

export async function readAuditLogForBooking(bookingId: string): Promise<AuditEntry[]> {
  const all = await readAuditLog(1000);
  return all.filter((e) => e.bookingId === bookingId);
}
