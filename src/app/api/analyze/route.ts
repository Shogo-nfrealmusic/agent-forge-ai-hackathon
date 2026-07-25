import { NextResponse } from "next/server";
import { z } from "zod";
import { findBooking } from "@/lib/fixtures/bookings";
import { analyzeBooking } from "@/lib/analysis";

/**
 * POST /api/analyze  { bookingId }
 *
 * Server-side only. This is the ONLY place the AI key is used, and it never
 * leaves the server — the response contains the recommendation, never the key.
 * Read-only with respect to bookings.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ bookingId: z.string().min(1) });

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body is not valid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
  }

  const booking = findBooking(parsed.data.bookingId);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  try {
    const result = await analyzeBooking(booking);
    return NextResponse.json(result);
  } catch (err) {
    // analyzeBooking has internal fallbacks; this is a last-resort guard.
    console.error("[analyze] unexpected failure", err);
    return NextResponse.json(
      { error: "Something went wrong while analysing this booking. Please try again." },
      { status: 500 },
    );
  }
}
