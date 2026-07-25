import type { DeliveryProviderInfo, DeliveryResult } from "@/lib/types";
import { isValidE164, maskPhone } from "@/lib/delivery/contact";

/**
 * WhatsApp delivery adapter (SERVER ONLY).
 *
 * Supports two OpenAPI-style providers behind one interface:
 *   - "meta"   : WhatsApp Business Cloud API (graph.facebook.com)
 *   - "twilio" : Twilio Programmable Messaging (WhatsApp channel)
 *
 * THREE SAFETY GATES, all of which must pass before a real message is sent:
 *   1. The caller must supply an APPROVED decision id (enforced in the route).
 *   2. A provider must be configured (token + sender id present).
 *   3. DELIVERY_ALLOW_REAL_SEND must be exactly "true".
 *
 * If gate 2 or 3 fails, the adapter runs in DRY RUN: it validates everything and
 * returns a result, but performs no network call at all. This is the default,
 * so a fresh clone of this repo cannot message anyone.
 */

const REQUEST_TIMEOUT_MS = 15000;

export interface WhatsAppConfig {
  provider: "meta" | "twilio";
  accessToken: string;
  /** Meta: phone number id. Twilio: the "whatsapp:+..." sender. */
  sender: string;
  /** Twilio only. */
  accountSid?: string;
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "delivery/whatsapp.ts must never run in the browser — provider tokens are server-side only.",
    );
  }
}

export function isRealSendEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DELIVERY_ALLOW_REAL_SEND?.trim() === "true";
}

/** Returns null when no provider is fully configured (→ dry run). */
export function readWhatsAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): WhatsAppConfig | null {
  const provider = env.WHATSAPP_PROVIDER?.trim().toLowerCase();

  if (provider === "meta") {
    const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
    const sender = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    if (!accessToken || !sender) return null;
    return { provider: "meta", accessToken, sender };
  }

  if (provider === "twilio") {
    const accessToken = env.TWILIO_AUTH_TOKEN?.trim();
    const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
    const sender = env.TWILIO_WHATSAPP_FROM?.trim();
    if (!accessToken || !accountSid || !sender) return null;
    return { provider: "twilio", accessToken, sender, accountSid };
  }

  return null;
}

export function describeWhatsAppProvider(
  env: NodeJS.ProcessEnv = process.env,
): DeliveryProviderInfo {
  const config = readWhatsAppConfig(env);
  return {
    channel: "whatsapp",
    provider: config?.provider ?? null,
    configured: config !== null,
    realSendEnabled: isRealSendEnabled(env),
  };
}

async function sendViaMeta(
  config: WhatsAppConfig,
  to: string,
  message: string,
): Promise<{ id?: string }> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${config.sender}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: message },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Never surface the body — provider errors can echo credentials back.
    throw new Error(`WhatsApp Cloud API returned HTTP ${res.status}`);
  }

  const json = (await res.json()) as { messages?: { id?: string }[] };
  return { id: json.messages?.[0]?.id };
}

async function sendViaTwilio(
  config: WhatsAppConfig,
  to: string,
  message: string,
): Promise<{ id?: string }> {
  const auth = Buffer.from(`${config.accountSid}:${config.accessToken}`).toString("base64");
  const body = new URLSearchParams({
    From: config.sender.startsWith("whatsapp:") ? config.sender : `whatsapp:${config.sender}`,
    To: `whatsapp:${to}`,
    Body: message,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!res.ok) {
    throw new Error(`Twilio API returned HTTP ${res.status}`);
  }

  const json = (await res.json()) as { sid?: string };
  return { id: json.sid };
}

/**
 * Send (or simulate sending) a WhatsApp message. NEVER throws.
 *
 * @param opts.config       Injected config. `undefined` reads the environment,
 *                          `null` forces dry run. Used by tests.
 * @param opts.allowRealSend Injected kill switch. Defaults to the environment.
 */
export async function sendWhatsApp(
  phone: string,
  message: string,
  opts: { config?: WhatsAppConfig | null; allowRealSend?: boolean } = {},
): Promise<DeliveryResult> {
  assertServerOnly();

  const destinationMasked = maskPhone(phone);
  const base = { channel: "whatsapp" as const, destinationMasked };

  if (!isValidE164(phone)) {
    return {
      ...base,
      mode: "dry_run",
      status: "failed",
      errorReason: "The phone number is not in E.164 format (e.g. +15550100)",
    };
  }

  if (message.trim().length === 0) {
    return { ...base, mode: "dry_run", status: "failed", errorReason: "The message is empty" };
  }

  const config = opts.config !== undefined ? opts.config : readWhatsAppConfig();
  const allowRealSend = opts.allowRealSend ?? isRealSendEnabled();

  // --- Gate 2 & 3: dry run unless a provider is configured AND unlocked ----
  if (!config) {
    return {
      ...base,
      mode: "dry_run",
      status: "prepared",
      errorReason:
        "No WhatsApp provider is configured, so nothing was sent. Use the 'Open in WhatsApp' link instead.",
    };
  }

  if (!allowRealSend) {
    return {
      ...base,
      mode: "dry_run",
      status: "prepared",
      provider: config.provider,
      errorReason:
        "DELIVERY_ALLOW_REAL_SEND is not 'true', so the provider call was simulated and nothing was sent.",
    };
  }

  try {
    const result =
      config.provider === "meta"
        ? await sendViaMeta(config, phone, message)
        : await sendViaTwilio(config, phone, message);

    return {
      ...base,
      mode: "provider_api",
      status: "sent",
      provider: config.provider,
      providerMessageId: result.id,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      mode: "provider_api",
      status: "failed",
      provider: config.provider,
      errorReason: reason,
    };
  }
}
