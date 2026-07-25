import { appendFile, mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type {
  AuditEntry,
  DecisionAuditEntry,
  DeliveryAuditEntry,
  DeliveryResult,
  StaffDecision,
} from "@/lib/types";
import { isDecisionEntry } from "@/lib/types";

/**
 * Local, append-only audit log (JSONL on disk).
 *
 * IMPORTANT: recording a DECISION performs no network I/O whatsoever. It does
 * not call a booking API, a payment API, a mail API or a calendar API. The only
 * side effect is appending one line to a local file.
 * Verified by tests/no-external-calls.test.ts.
 *
 * Recording a DELIVERY is also pure file I/O — the network call (if any) happens
 * in the delivery adapter, and its outcome is passed in here as data.
 */

const DEFAULT_LOG_PATH = path.join(process.cwd(), ".data", "audit-log.jsonl");

function logPath(): string {
  return process.env.AUDIT_LOG_PATH?.trim() || DEFAULT_LOG_PATH;
}

const DECISION_NOTES: Record<StaffDecision, string> = {
  approved: "staff approved recommendation (no booking system call was made)",
  rejected: "staff rejected recommendation (no booking system call was made)",
  needs_discussion:
    "staff flagged for discussion / needs check (no booking system call was made)",
};

/* ------------------------------------------------------------------------ */
/* Decisions                                                                 */
/* ------------------------------------------------------------------------ */

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
    { message: "A reason is required when rejecting", path: ["reason"] },
  );

export type DecisionInput = z.infer<typeof decisionInputSchema>;

export async function recordDecision(input: DecisionInput): Promise<DecisionAuditEntry> {
  const parsed = decisionInputSchema.parse(input);

  const entry: DecisionAuditEntry = {
    kind: "decision",
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

  await append(entry);
  return entry;
}

/* ------------------------------------------------------------------------ */
/* Deliveries                                                                */
/* ------------------------------------------------------------------------ */

const DELIVERY_NOTES: Record<DeliveryAuditEntry["mode"], string> = {
  link_handoff: "draft handed off to the staff member's own client (nothing sent by this server)",
  dry_run: "delivery simulated — no provider call was made",
  provider_api: "message sent through the configured provider after staff approval",
};

export async function recordDelivery(input: {
  bookingId: string;
  decisionEntryId: string;
  result: DeliveryResult;
  messageLength: number;
}): Promise<DeliveryAuditEntry> {
  const entry: DeliveryAuditEntry = {
    kind: "delivery",
    id: randomUUID(),
    recordedAt: new Date().toISOString(),
    bookingId: input.bookingId,
    decisionEntryId: input.decisionEntryId,
    channel: input.result.channel,
    mode: input.result.mode,
    status: input.result.status,
    // The full phone/email is never written to the log — only a masked form.
    destinationMasked: input.result.destinationMasked,
    provider: input.result.provider,
    providerMessageId: input.result.providerMessageId,
    errorReason: input.result.errorReason,
    // The message body is never written to the log — only its length.
    messageLength: input.messageLength,
    bookingSystemMutated: false,
    note: DELIVERY_NOTES[input.result.mode],
  };

  await append(entry);
  return entry;
}

/* ------------------------------------------------------------------------ */
/* Reads                                                                     */
/* ------------------------------------------------------------------------ */

async function append(entry: AuditEntry): Promise<void> {
  const file = logPath();
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(entry)}\n`, "utf8");
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
      const parsed = JSON.parse(trimmed) as AuditEntry;
      // Entries written before the delivery feature existed have no `kind`.
      if (!parsed.kind) (parsed as AuditEntry).kind = "decision";
      entries.push(parsed);
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

/**
 * The approval gate for outbound messaging.
 *
 * Returns the most recent APPROVED decision for this booking, or null. A message
 * may only be delivered when this returns an entry — enforced in the route
 * handler, so no code path can message a customer without a staff approval
 * already on record.
 */
export async function findLatestApproval(
  bookingId: string,
): Promise<DecisionAuditEntry | null> {
  const entries = await readAuditLogForBooking(bookingId); // newest first
  for (const entry of entries) {
    if (isDecisionEntry(entry) && entry.decision === "approved") return entry;
  }
  return null;
}
