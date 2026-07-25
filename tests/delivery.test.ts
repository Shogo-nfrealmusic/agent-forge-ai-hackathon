import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMailtoLink,
  buildWhatsAppLink,
  isValidE164,
  maskEmail,
  maskPhone,
  normalisePhone,
} from "@/lib/delivery/contact";
import {
  isRealSendEnabled,
  readWhatsAppConfig,
  sendWhatsApp,
  type WhatsAppConfig,
} from "@/lib/delivery/whatsapp";
import { sendEmail } from "@/lib/delivery/email";

const META: WhatsAppConfig = {
  provider: "meta",
  accessToken: "test-token-not-real",
  sender: "1234567890",
};

const TWILIO: WhatsAppConfig = {
  provider: "twilio",
  accessToken: "test-token-not-real",
  accountSid: "ACtest",
  sender: "whatsapp:+14155238886",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("contact helpers", () => {
  it("normalises a phone number to digits", () => {
    expect(normalisePhone("+1 (555) 0103")).toBe("15550103");
  });

  it("validates E.164", () => {
    expect(isValidE164("+15550103")).toBe(true);
    expect(isValidE164("15550103")).toBe(false);
    expect(isValidE164("+0155501")).toBe(false);
    expect(isValidE164("not a number")).toBe(false);
  });

  it("masks a phone number, keeping only the prefix and last two digits", () => {
    const masked = maskPhone("+15550103");
    expect(masked).not.toContain("15550103");
    expect(masked.endsWith("03")).toBe(true);
    expect(masked).toContain("*");
  });

  it("masks an email address", () => {
    const masked = maskEmail("demo-four@example.com");
    expect(masked).not.toContain("demo-four");
    expect(masked.endsWith("@example.com")).toBe(true);
  });

  it("builds a wa.me link with the message URL-encoded", () => {
    const link = buildWhatsAppLink("+1 555 0103", "Hi there & good morning");
    expect(link.startsWith("https://wa.me/15550103?text=")).toBe(true);
    expect(link).toContain("%26"); // & is encoded, so it cannot break the query
    expect(link).not.toContain(" ");
  });

  it("builds a mailto link with spaces encoded as %20, not +", () => {
    const link = buildMailtoLink("demo@example.com", "Weather update", "Hello there");
    expect(link.startsWith("mailto:demo@example.com?")).toBe(true);
    expect(link).toContain("%20");
    expect(link).not.toContain("+");
  });
});

describe("readWhatsAppConfig", () => {
  it("returns null when no provider is selected", () => {
    expect(readWhatsAppConfig({} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("returns null when a provider is selected but credentials are incomplete", () => {
    expect(
      readWhatsAppConfig({
        WHATSAPP_PROVIDER: "meta",
        WHATSAPP_ACCESS_TOKEN: "t",
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      readWhatsAppConfig({
        WHATSAPP_PROVIDER: "twilio",
        TWILIO_AUTH_TOKEN: "t",
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("reads a complete meta config", () => {
    const cfg = readWhatsAppConfig({
      WHATSAPP_PROVIDER: "meta",
      WHATSAPP_ACCESS_TOKEN: "t",
      WHATSAPP_PHONE_NUMBER_ID: "123",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg).toEqual({ provider: "meta", accessToken: "t", sender: "123" });
  });

  it("never reads a NEXT_PUBLIC_ variable", () => {
    expect(
      readWhatsAppConfig({
        WHATSAPP_PROVIDER: "meta",
        NEXT_PUBLIC_WHATSAPP_ACCESS_TOKEN: "leaked",
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull();
  });
});

describe("the real-send kill switch", () => {
  it('is off unless the value is exactly "true"', () => {
    expect(isRealSendEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isRealSendEnabled({ DELIVERY_ALLOW_REAL_SEND: "false" } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isRealSendEnabled({ DELIVERY_ALLOW_REAL_SEND: "TRUE" } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isRealSendEnabled({ DELIVERY_ALLOW_REAL_SEND: "1" } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isRealSendEnabled({ DELIVERY_ALLOW_REAL_SEND: "true" } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});

describe("sendWhatsApp — nothing is sent unless every gate passes", () => {
  it("makes NO network call when no provider is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendWhatsApp("+15550103", "hello", { config: null });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.mode).toBe("dry_run");
    expect(result.status).toBe("prepared");
    expect(result.errorReason).toContain("No WhatsApp provider is configured");
  });

  it("makes NO network call when the kill switch is off, even with a provider", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendWhatsApp("+15550103", "hello", {
      config: META,
      allowRealSend: false,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.mode).toBe("dry_run");
    expect(result.status).toBe("prepared");
    expect(result.errorReason).toContain("DELIVERY_ALLOW_REAL_SEND");
  });

  it("rejects a phone number that is not E.164 without calling out", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendWhatsApp("0555-0103", "hello", {
      config: META,
      allowRealSend: true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("E.164");
  });

  it("rejects an empty message without calling out", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendWhatsApp("+15550103", "   ", {
      config: META,
      allowRealSend: true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");
  });
});

describe("sendWhatsApp — provider calls when fully unlocked", () => {
  it("calls the WhatsApp Cloud API and returns the message id", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.TEST" }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendWhatsApp("+15550103", "hello", {
      config: META,
      allowRealSend: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("provider_api");
    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toBe("wamid.TEST");
  });

  it("never puts the token in the URL or the body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.TEST" }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    await sendWhatsApp("+15550103", "hello", { config: META, allowRealSend: true });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(META.accessToken);
    expect(String(init.body)).not.toContain(META.accessToken);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${META.accessToken}`,
    );
  });

  it("uses Basic auth and the whatsapp: prefix for Twilio", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sid: "SMtest" }) });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendWhatsApp("+15550103", "hello", {
      config: TWILIO,
      allowRealSend: true,
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/Accounts/ACtest/Messages.json");
    expect(url).not.toContain(TWILIO.accessToken);
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect(String(init.body)).toContain("whatsapp%3A%2B15550103");
    expect(result.providerMessageId).toBe("SMtest");
  });

  it("returns failed (never throws) when the provider errors, without echoing the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => `invalid token ${META.accessToken}`,
      }),
    );

    const result = await sendWhatsApp("+15550103", "hello", {
      config: META,
      allowRealSend: true,
    });

    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("401");
    expect(result.errorReason).not.toContain(META.accessToken);
  });

  it("returns failed (never throws) when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await sendWhatsApp("+15550103", "hello", {
      config: META,
      allowRealSend: true,
    });
    expect(result.status).toBe("failed");
    expect(result.mode).toBe("provider_api");
  });

  it("always returns a masked destination, never the raw number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const result = await sendWhatsApp("+15550103", "hello", {
      config: META,
      allowRealSend: true,
    });
    expect(result.destinationMasked).not.toContain("15550103");
  });
});

describe("sendEmail — hand-off only, by design", () => {
  it("never calls a provider", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendEmail("demo@example.com", "hello");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.mode).toBe("link_handoff");
    expect(result.status).toBe("prepared");
  });

  it("rejects an invalid address", async () => {
    const result = await sendEmail("not-an-email", "hello");
    expect(result.status).toBe("failed");
  });

  it("rejects an empty message", async () => {
    const result = await sendEmail("demo@example.com", "   ");
    expect(result.status).toBe("failed");
  });

  it("masks the destination", async () => {
    const result = await sendEmail("demo-four@example.com", "hello");
    expect(result.destinationMasked).not.toContain("demo-four");
  });
});
