import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  findLatestApproval,
  readAuditLog,
  readAuditLogForBooking,
  recordDecision,
  recordDelivery,
} from "@/lib/audit/store";
import type { DecisionInput } from "@/lib/audit/store";
import { isDecisionEntry, isDeliveryEntry } from "@/lib/types";
import type { DecisionAuditEntry, DeliveryAuditEntry, DeliveryResult } from "@/lib/types";

let dir: string;

const BASE: DecisionInput = {
  bookingId: "demo-booking-003",
  decision: "approved",
  reason: null,
  deterministicRiskLevel: "medium",
  aiRiskLevel: "medium",
  aiRecommendation: "plan_change",
  agreement: "agree",
  weatherSource: "fixture",
  aiSource: "mock",
};

const REJECT_REASON =
  "The indoor studio is free, so I would rather change the location than the date";

/** Narrowing helpers so the union type does not leak into every assertion. */
function decisions(entries: Awaited<ReturnType<typeof readAuditLog>>): DecisionAuditEntry[] {
  return entries.filter(isDecisionEntry);
}
function deliveries(entries: Awaited<ReturnType<typeof readAuditLog>>): DeliveryAuditEntry[] {
  return entries.filter(isDeliveryEntry);
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wbaa-audit-"));
  process.env.AUDIT_LOG_PATH = path.join(dir, "audit-log.jsonl");
});

afterEach(async () => {
  delete process.env.AUDIT_LOG_PATH;
  await rm(dir, { recursive: true, force: true });
});

describe("audit log — decisions", () => {
  it("returns an empty list before anything is recorded", async () => {
    expect(await readAuditLog()).toEqual([]);
  });

  it('records an approval as "staff approved recommendation"', async () => {
    const entry = await recordDecision(BASE);
    expect(entry.kind).toBe("decision");
    expect(entry.decision).toBe("approved");
    expect(entry.note).toContain("staff approved recommendation");
    expect(entry.bookingSystemMutated).toBe(false);

    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].id).toBe(entry.id);
  });

  it("persists the reject reason in the audit log", async () => {
    await recordDecision({ ...BASE, decision: "rejected", reason: REJECT_REASON });

    const [entry] = decisions(await readAuditLog());
    expect(entry.decision).toBe("rejected");
    expect(entry.reason).toBe(REJECT_REASON);
    expect(entry.bookingSystemMutated).toBe(false);
  });

  it("refuses a reject with no reason", async () => {
    await expect(recordDecision({ ...BASE, decision: "rejected", reason: null })).rejects.toThrow();
    await expect(recordDecision({ ...BASE, decision: "rejected", reason: "   " })).rejects.toThrow();
    expect(await readAuditLog()).toEqual([]);
  });

  it("records needs_discussion as a needs-check state", async () => {
    const entry = await recordDecision({
      ...BASE,
      decision: "needs_discussion",
      agreement: "needs_check",
      reason: "The AI and the rules disagree, so the team should look at it",
    });
    expect(entry.decision).toBe("needs_discussion");
    expect(entry.note).toContain("needs check");
    expect(entry.agreement).toBe("needs_check");
  });

  it("appends entries and returns them newest first", async () => {
    const first = await recordDecision(BASE);
    const second = await recordDecision({ ...BASE, bookingId: "demo-booking-001" });

    const log = await readAuditLog();
    expect(log.map((e) => e.id)).toEqual([second.id, first.id]);
  });

  it("filters by bookingId", async () => {
    await recordDecision(BASE);
    await recordDecision({ ...BASE, bookingId: "demo-booking-001" });

    const filtered = await readAuditLogForBooking("demo-booking-001");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].bookingId).toBe("demo-booking-001");
  });

  it("rejects an unknown decision value", async () => {
    await expect(
      recordDecision({ ...BASE, decision: "cancel_booking" } as unknown as DecisionInput),
    ).rejects.toThrow();
  });

  it("always stamps bookingSystemMutated: false", async () => {
    for (const decision of ["approved", "needs_discussion"] as const) {
      const entry = await recordDecision({ ...BASE, decision });
      expect(entry.bookingSystemMutated).toBe(false);
    }
  });
});

describe("audit log — the approval gate", () => {
  it("reports no approval for a booking with no history", async () => {
    expect(await findLatestApproval("demo-booking-003")).toBeNull();
  });

  it("does not treat a reject or a needs_discussion as an approval", async () => {
    await recordDecision({ ...BASE, decision: "rejected", reason: REJECT_REASON });
    await recordDecision({ ...BASE, decision: "needs_discussion" });
    expect(await findLatestApproval("demo-booking-003")).toBeNull();
  });

  it("finds an approval once one is recorded", async () => {
    const approval = await recordDecision(BASE);
    const found = await findLatestApproval("demo-booking-003");
    expect(found?.id).toBe(approval.id);
  });

  it("does not leak an approval across bookings", async () => {
    await recordDecision(BASE);
    expect(await findLatestApproval("demo-booking-001")).toBeNull();
  });

  it("returns the most recent approval when there are several", async () => {
    await recordDecision(BASE);
    const second = await recordDecision(BASE);
    expect((await findLatestApproval("demo-booking-003"))?.id).toBe(second.id);
  });
});

describe("audit log — deliveries", () => {
  const result: DeliveryResult = {
    channel: "whatsapp",
    mode: "dry_run",
    status: "prepared",
    destinationMasked: "+1555**02",
    provider: "meta",
  };

  it("records a delivery linked to the approving decision", async () => {
    const approval = await recordDecision(BASE);
    const entry = await recordDelivery({
      bookingId: BASE.bookingId,
      decisionEntryId: approval.id,
      result,
      messageLength: 240,
    });

    expect(entry.kind).toBe("delivery");
    expect(entry.decisionEntryId).toBe(approval.id);
    expect(entry.channel).toBe("whatsapp");
    expect(entry.status).toBe("prepared");
    expect(entry.bookingSystemMutated).toBe(false);
    expect(entry.note).toContain("no provider call");
  });

  it("stores the message length but never the message body", async () => {
    const approval = await recordDecision(BASE);
    const secret = "Please meet us at the north gate at 09:00.";
    const entry = await recordDelivery({
      bookingId: BASE.bookingId,
      decisionEntryId: approval.id,
      result,
      messageLength: secret.length,
    });

    expect(entry.messageLength).toBe(secret.length);
    expect(JSON.stringify(entry)).not.toContain("north gate");
  });

  it("stores only the masked destination", async () => {
    const approval = await recordDecision(BASE);
    const entry = await recordDelivery({
      bookingId: BASE.bookingId,
      decisionEntryId: approval.id,
      result: { ...result, destinationMasked: "+1555**03" },
      messageLength: 10,
    });

    expect(JSON.stringify(entry)).not.toContain("+15550103");
    expect(entry.destinationMasked).toBe("+1555**03");
  });

  it("reads decisions and deliveries back from the same log", async () => {
    const approval = await recordDecision(BASE);
    await recordDelivery({
      bookingId: BASE.bookingId,
      decisionEntryId: approval.id,
      result,
      messageLength: 100,
    });

    const log = await readAuditLog();
    expect(log).toHaveLength(2);
    expect(decisions(log)).toHaveLength(1);
    expect(deliveries(log)).toHaveLength(1);
  });
});
