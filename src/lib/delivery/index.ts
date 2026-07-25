import type { Booking, DeliveryChannel, DeliveryProviderInfo, DeliveryResult } from "@/lib/types";
import { sendWhatsApp, describeWhatsAppProvider } from "@/lib/delivery/whatsapp";
import { sendEmail, describeEmailProvider } from "@/lib/delivery/email";
import {
  buildEmailSubject,
  buildMailtoLink,
  buildWhatsAppLink,
} from "@/lib/delivery/contact";

/** Server-side dispatcher across delivery channels. */

export function describeDeliveryProviders(): DeliveryProviderInfo[] {
  return [describeWhatsAppProvider(), describeEmailProvider()];
}

/**
 * Demo destination override.
 *
 * During a live demo you want the message to land on your own phone rather than
 * a fictional +1-555-01XX number. That real number must NOT go into the
 * fixtures: this repository is public, and a personal phone number committed to
 * git cannot be taken back. So it lives in an environment variable instead
 * (.env is gitignored) and is masked everywhere it is recorded.
 *
 * Leave DEMO_WHATSAPP_TO / DEMO_EMAIL_TO unset for normal operation.
 */
export function readDestinationOverride(
  channel: DeliveryChannel,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = channel === "whatsapp" ? env.DEMO_WHATSAPP_TO : env.DEMO_EMAIL_TO;
  return raw?.trim() || null;
}

export interface ResolvedDestination {
  value: string;
  overridden: boolean;
}

export function destinationFor(
  booking: Booking,
  channel: DeliveryChannel,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedDestination {
  const override = readDestinationOverride(channel, env);
  if (override) return { value: override, overridden: true };
  return {
    value: channel === "whatsapp" ? booking.customerPhone : booking.customerEmail,
    overridden: false,
  };
}

/**
 * Hand-off deep links. These are what the demo actually uses: they open the
 * staff member's own WhatsApp / mail client with the draft pre-filled, so the
 * human is unavoidably the one who presses send.
 */
export function buildHandoffLinks(booking: Booking, message: string) {
  return {
    whatsapp: buildWhatsAppLink(destinationFor(booking, "whatsapp").value, message),
    email: buildMailtoLink(
      destinationFor(booking, "email").value,
      buildEmailSubject(booking.plan, booking.date),
      message,
    ),
  };
}

/**
 * What the UI needs to build hand-off links. The number itself must reach the
 * browser — a wa.me link cannot work otherwise — but it is never written to the
 * repository and never stored unmasked in the audit log.
 */
export function describeDeliveryTargets(booking: Booking) {
  const whatsapp = destinationFor(booking, "whatsapp");
  const email = destinationFor(booking, "email");
  return {
    whatsapp: whatsapp.value,
    email: email.value,
    overridden: whatsapp.overridden || email.overridden,
  };
}

/** Dispatch to the right channel adapter. NEVER throws. */
export async function deliverMessage(
  booking: Booking,
  channel: DeliveryChannel,
  message: string,
): Promise<DeliveryResult> {
  const { value, overridden } = destinationFor(booking, channel);
  const result =
    channel === "whatsapp"
      ? await sendWhatsApp(value, message)
      : await sendEmail(value, message);
  return { ...result, destinationOverridden: overridden };
}
