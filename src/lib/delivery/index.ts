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

export function destinationFor(booking: Booking, channel: DeliveryChannel): string {
  return channel === "whatsapp" ? booking.customerPhone : booking.customerEmail;
}

/**
 * Hand-off deep links. These are what the demo actually uses: they open the
 * staff member's own WhatsApp / mail client with the draft pre-filled, so the
 * human is unavoidably the one who presses send.
 */
export function buildHandoffLinks(booking: Booking, message: string) {
  return {
    whatsapp: buildWhatsAppLink(booking.customerPhone, message),
    email: buildMailtoLink(
      booking.customerEmail,
      buildEmailSubject(booking.plan, booking.date),
      message,
    ),
  };
}

/** Dispatch to the right channel adapter. NEVER throws. */
export async function deliverMessage(
  booking: Booking,
  channel: DeliveryChannel,
  message: string,
): Promise<DeliveryResult> {
  return channel === "whatsapp"
    ? sendWhatsApp(booking.customerPhone, message)
    : sendEmail(booking.customerEmail, message);
}
