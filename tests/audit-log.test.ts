import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readAuditLog, readAuditLogForBooking, recordDecision } from "@/lib/audit/store";
import type { DecisionInput } from "@/lib/audit/store";

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

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wbaa-audit-"));
  process.env.AUDIT_LOG_PATH = path.join(dir, "audit-log.jsonl");
});

afterEach(async () => {
  delete process.env.AUDIT_LOG_PATH;
  await rm(dir, { recursive: true, force: true });
});

describe("audit log", () => {
  it("returns an empty list before anything is recorded", async () => {
    expect(await readAuditLog()).toEqual([]);
  });

  it('records an approval as "staff approved recommendation"', async () => {
    const entry = await recordDecision(BASE);
    expect(entry.decision).toBe("approved");
    expect(entry.note).toContain("staff approved recommendation");
    expect(entry.bookingSystemMutated).toBe(false);

    const log = await readAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].id).toBe(entry.id);
  });

  it("persists the reject reason in the audit log", async () => {
    await recordDecision({
      ...BASE,
      decision: "rejected",
      reason: "屋内スタジオに空きがあるため振替ではなく変更で対応したい",
    });

    const log = await readAuditLog();
    expect(log[0].decision).toBe("rejected");
    expect(log[0].reason).toBe("屋内スタジオに空きがあるため振替ではなく変更で対応したい");
    expect(log[0].bookingSystemMutated).toBe(false);
  });

  it("refuses a reject with no reason", async () => {
    await expect(recordDecision({ ...BASE, decision: "rejected", reason: null })).rejects.toThrow();
    await expect(recordDecision({ ...BASE, decision: "rejected", reason: "   " })).rejects.toThrow();
    expect(await readAuditLog()).toEqual([]);
  });

  it("records needs_discussion as a 要確認 state", async () => {
    const entry = await recordDecision({
      ...BASE,
      decision: "needs_discussion",
      agreement: "needs_check",
      reason: "AI判定とルール判定が割れているためチームで確認",
    });
    expect(entry.decision).toBe("needs_discussion");
    expect(entry.note).toContain("要確認");
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
