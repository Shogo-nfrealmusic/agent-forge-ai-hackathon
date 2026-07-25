import type { DeliveryProviderInfo, DeliveryResult } from "@/lib/types";
import { maskEmail } from "@/lib/delivery/contact";

/**
 * Email delivery adapter (SERVER ONLY).
 *
 * DELIBERATELY NOT IMPLEMENTED against a provider.
 *
 * The original brief for this prototype forbade connecting to email services
 * (Resend et al). WhatsApp was added later as an explicit requirement, so it has
 * a real provider adapter; email deliberately keeps the original constraint and
 * only supports the hand-off path: the UI produces a `mailto:` link and the
 * staff member sends from their own client. Nothing leaves this server.
 *
 * To add a provider later, implement `EmailSender` below and wire it in here.
 * Everything around it (approval gate, audit record, masking, kill switch) is
 * already in place and needs no change.
 */

export interface EmailSender {
  /**
   * Send one message. Must not throw; return a failed DeliveryResult instead.
   * Requirements for any implementation:
   *   - read credentials from process.env only, never NEXT_PUBLIC_*
   *   - never include the API key in a URL or a request body
   *   - never echo the provider's error body (it can contain the key)
   *   - honour DELIVERY_ALLOW_REAL_SEND
   */
  send(input: {
    to: string;
    subject: string;
    body: string;
  }): Promise<DeliveryResult>;
}

export function describeEmailProvider(): DeliveryProviderInfo {
  return {
    channel: "email",
    provider: null,
    configured: false,
    realSendEnabled: false,
  };
}

/**
 * "Sends" an email. Always a hand-off — no provider call is ever made.
 * NEVER throws.
 */
export async function sendEmail(email: string, body: string): Promise<DeliveryResult> {
  const destinationMasked = maskEmail(email);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return {
      channel: "email",
      mode: "dry_run",
      status: "failed",
      destinationMasked,
      errorReason: "The email address is not valid",
    };
  }

  if (body.trim().length === 0) {
    return {
      channel: "email",
      mode: "dry_run",
      status: "failed",
      destinationMasked,
      errorReason: "The message is empty",
    };
  }

  return {
    channel: "email",
    mode: "link_handoff",
    status: "prepared",
    destinationMasked,
    errorReason:
      "No email provider is wired up by design. Use the 'Open in email client' link to send it yourself.",
  };
}
