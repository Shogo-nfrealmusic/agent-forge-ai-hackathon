import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { findLatestApproval, recordDecision } from "@/lib/audit/store";
import type { DecisionInput } from "@/lib/audit/store";
import { readSourceFiles } from "./helpers";

/**
 * The central safety guarantee.
 *
 * Recording a staff decision must not touch any external system — no booking
 * API, no Stripe, no Slack, no Google Calendar, no email provider. It only
 * appends to a local file.
 *
 * Outbound messaging exists, but it is a SEPARATE, EXPLICIT action: it lives
 * behind /api/deliver, requires an approved decision on record, and is off by
 * default. Approving something never sends anything by itself.
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

describe("recording a decision performs no external I/O", () => {
  it("does not call fetch for any of the three decisions", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("An external API was called. This code path must perform no network I/O.");
    });
    vi.stubGlobal("fetch", fetchSpy);

    for (const decision of ["approved", "needs_discussion"] as const) {
      await recordDecision({ ...APPROVAL, decision });
    }
    await recordDecision({
      ...APPROVAL,
      decision: "rejected",
      reason: "Handling it a different way",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("approving does not send a message — it only unlocks the ability to", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("Approving a recommendation must never deliver a message by itself.");
    });
    vi.stubGlobal("fetch", fetchSpy);

    await recordDecision(APPROVAL);

    expect(fetchSpy).not.toHaveBeenCalled();
    // The approval is now on record, so a *separate* deliver call would be allowed.
    expect(await findLatestApproval(APPROVAL.bookingId)).not.toBeNull();
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

  it("the delivery route enforces the approval gate before anything is sent", async () => {
    const files = await readSourceFiles();
    const route = files.find((f) => f.rel.includes(path.join("api", "deliver")));

    expect(route, "the deliver route must exist").toBeDefined();
    expect(route?.content).toContain("findLatestApproval");
    expect(route?.content).toContain("409");
    // The gate must be checked before the message is dispatched. Compare the
    // call sites, not the imports at the top of the file.
    const gateAt = route?.content.indexOf("await findLatestApproval(") ?? -1;
    const sendAt = route?.content.indexOf("await deliverMessage(") ?? -1;
    expect(gateAt, "the route must call findLatestApproval").toBeGreaterThan(-1);
    expect(sendAt, "the route must call deliverMessage").toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(gateAt);
  });

  it("every delivery is written to the audit log", async () => {
    const files = await readSourceFiles();
    const route = files.find((f) => f.rel.includes(path.join("api", "deliver")));
    expect(route?.content).toContain("recordDelivery");
  });
});

describe("no booking, payment or unexpected messaging integration", () => {
  it("integrates no SDK for bookings, payments or messaging", async () => {
    const files = await readSourceFiles();
    // Note: WhatsApp is reached over plain fetch, so even the supported
    // providers add no SDK dependency and no supply-chain surface.
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
          expect(spec.toLowerCase().includes(bad), `${rel} must not import ${spec}`).toBe(false);
        }
      }
    }
  });

  it("references no booking-mutation or payment endpoint", async () => {
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

  it("only reaches hosts this app documents", async () => {
    const files = await readSourceFiles();
    const allowedHosts = [
      "api.open-meteo.com", // weather
      "api.gmi-serving.com", // GMI Cloud inference (AI failover)
      "www.daytona.io", // docs link in a comment
      "graph.facebook.com", // WhatsApp Cloud API
      "api.twilio.com", // Twilio WhatsApp
      "wa.me", // click-to-chat hand-off link (not a server call)
      "open-meteo.com", // docs link in a comment
      "faq.whatsapp.com", // docs link in a comment
      "developers.facebook.com", // docs link in a comment
      "www.twilio.com", // docs link in a comment
      "dashscope-intl.aliyuncs.com", // default AI base URL (overridable)
      "api.openai.com", // documented alternative in a comment
    ];

    for (const { rel, content } of files) {
      for (const match of content.match(/https?:\/\/([\w.-]+)/g) ?? []) {
        const host = match.replace(/^https?:\/\//, "");
        expect(
          allowedHosts.includes(host),
          `${rel} references an undocumented host: ${host}`,
        ).toBe(true);
      }
    }
  });
});
