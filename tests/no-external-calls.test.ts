import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { recordDecision } from "@/lib/audit/store";
import type { DecisionInput } from "@/lib/audit/store";
import { readSourceFiles } from "./helpers";

/**
 * The central safety guarantee: approving a recommendation must not touch any
 * external system — no booking API, no Stripe, no Slack, no Google Calendar,
 * no Resend. It only appends to a local file.
 */

let dir: string;

const APPROVAL: DecisionInput = {
  bookingId: "demo-booking-004",
  decision: "approved",
  reason: null,
  deterministicRiskLevel: "high",
  aiRiskLevel: "high",
  aiRecommendation: "reschedule",
  agreement: "agree",
  weatherSource: "fixture",
  aiSource: "mock",
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wbaa-noext-"));
  process.env.AUDIT_LOG_PATH = path.join(dir, "audit-log.jsonl");
});

afterEach(async () => {
  delete process.env.AUDIT_LOG_PATH;
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("Approve performs no external I/O", () => {
  it("does not call fetch when a decision is recorded", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("外部APIが呼ばれました。この経路にネットワークI/Oがあってはいけません。");
    });
    vi.stubGlobal("fetch", fetchSpy);

    for (const decision of ["approved", "needs_discussion"] as const) {
      await recordDecision({ ...APPROVAL, decision });
    }
    await recordDecision({ ...APPROVAL, decision: "rejected", reason: "別案で対応" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("writes the decision only to the local audit file", async () => {
    const entry = await recordDecision(APPROVAL);
    const raw = await readFile(process.env.AUDIT_LOG_PATH as string, "utf8");
    const lines = raw.trim().split("\n");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).id).toBe(entry.id);
    expect(JSON.parse(lines[0]).bookingSystemMutated).toBe(false);
  });
});

describe("static guarantees about the decision path", () => {
  it("the audit store and the decisions route contain no network calls", async () => {
    const files = await readSourceFiles();
    const decisionPath = files.filter(
      (f) =>
        f.rel.includes(path.join("lib", "audit")) ||
        f.rel.includes(path.join("api", "decisions")),
    );

    expect(decisionPath.length).toBeGreaterThan(0);
    for (const { rel, content } of decisionPath) {
      expect(content, `${rel} must not call fetch()`).not.toMatch(/\bfetch\s*\(/);
      expect(content, `${rel} must not use XMLHttpRequest`).not.toContain("XMLHttpRequest");
    }
  });

  it("the codebase integrates no booking / payment / messaging SDK", async () => {
    const files = await readSourceFiles();
    const forbidden = [
      "stripe",
      "@slack/",
      "slack-sdk",
      "googleapis",
      "google-calendar",
      "resend",
      "nodemailer",
      "twilio",
      "sendgrid",
    ];

    for (const { rel, content } of files) {
      const imports = [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of imports) {
        for (const bad of forbidden) {
          expect(
            spec.toLowerCase().includes(bad),
            `${rel} must not import ${spec}`,
          ).toBe(false);
        }
      }
    }
  });

  it("no source file calls a booking-mutation endpoint", async () => {
    const files = await readSourceFiles();
    const forbiddenUrls = [
      "api.stripe.com",
      "hooks.slack.com",
      "slack.com/api",
      "googleapis.com",
      "api.resend.com",
    ];

    for (const { rel, content } of files) {
      for (const url of forbiddenUrls) {
        expect(content.includes(url), `${rel} must not reference ${url}`).toBe(false);
      }
    }
  });
});
