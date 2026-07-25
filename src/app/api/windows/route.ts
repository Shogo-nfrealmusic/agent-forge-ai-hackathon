import { NextResponse } from "next/server";
import { z } from "zod";
import { findBooking } from "@/lib/fixtures/bookings";
import { analyseBookingWindows } from "@/lib/analysis";

/**
 * POST /api/windows  { bookingId }
 *
 * The slow half of the analysis: fetch the day forecast, ask the model to WRITE
 * a Python ranking function, and run it inside a Daytona sandbox.
 *
 * Split out from /api/analyze so the risk assessment can render immediately
 * instead of waiting ~20s behind code generation and sandbox startup.
 *
 * Server-side only, read-only, and it never runs generated code locally.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
    const windows = await analyseBookingWindows(booking);
    return NextResponse.json({ windows });
  } catch (err) {
    // analyseBookingWindows has internal fallbacks; last-resort guard only.
    console.error("[windows] unexpected failure", err);
    return NextResponse.json(
      { error: "Could not analyse alternative windows." },
      { status: 500 },
    );
  }
}
