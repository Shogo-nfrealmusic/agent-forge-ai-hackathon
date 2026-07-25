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
    return NextResponse.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bookingId が必要です" }, { status: 400 });
  }

  const booking = findBooking(parsed.data.bookingId);
  if (!booking) {
    return NextResponse.json({ error: "予約が見つかりません" }, { status: 404 });
  }

  try {
    const result = await analyzeBooking(booking);
    return NextResponse.json(result);
  } catch (err) {
    // analyzeBooking has internal fallbacks; this is a last-resort guard.
    console.error("[analyze] unexpected failure", err);
    return NextResponse.json(
      { error: "解析中に予期しないエラーが発生しました。時間をおいて再実行してください。" },
      { status: 500 },
    );
  }
}
