import { NextResponse } from "next/server";
import { z } from "zod";
import { findBooking } from "@/lib/fixtures/bookings";
import { deliverMessage } from "@/lib/delivery";
import { findLatestApproval, recordDelivery } from "@/lib/audit/store";

/**
 * POST /api/deliver  { bookingId, channel, message }
 *
 * Sends (or simulates sending) the customer message.
 *
 * THE APPROVAL GATE LIVES HERE: the booking must already have an `approved`
 * decision in the audit log, otherwise this returns 409 and nothing happens.
 * There is no code path that messages a customer without a staff approval on
 * record, and the outcome is always written to the audit log.
 *
 * Real sending additionally requires a configured provider AND
 * DELIVERY_ALLOW_REAL_SEND=true. Both default to off.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  bookingId: z.string().min(1),
  channel: z.enum(["whatsapp", "email"]),
  message: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body is not valid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const booking = findBooking(parsed.data.bookingId);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // --- Gate 1: a staff approval must already exist ------------------------
  const approval = await findLatestApproval(booking.bookingId);
  if (!approval) {
    return NextResponse.json(
      {
        error:
          "This booking has no approved decision yet. Approve the recommendation before sending anything to the customer.",
      },
      { status: 409 },
    );
  }

  const result = await deliverMessage(booking, parsed.data.channel, parsed.data.message);

  const entry = await recordDelivery({
    bookingId: booking.bookingId,
    decisionEntryId: approval.id,
    result,
    messageLength: parsed.data.message.length,
  });

  return NextResponse.json({ result, entry, bookingSystemMutated: false }, { status: 201 });
}
