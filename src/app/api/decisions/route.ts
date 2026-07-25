import { NextResponse } from "next/server";
import { z } from "zod";
import { decisionInputSchema, readAuditLog, recordDecision } from "@/lib/audit/store";

/**
 * GET  /api/decisions            → audit log (newest first)
 * POST /api/decisions  { ... }   → append one staff decision
 *
 * A POST here writes ONE LINE to a local file. It does not call the booking
 * system, Stripe, Slack, Google Calendar, Resend, or any other external
 * service — approving a recommendation never changes a booking.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await readAuditLog();
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  const parsed = decisionInputSchema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const entry = await recordDecision(parsed.data);
    return NextResponse.json({ entry, bookingSystemMutated: false }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "入力内容が不正です" }, { status: 400 });
    }
    console.error("[decisions] failed to append audit entry", err);
    return NextResponse.json({ error: "監査ログへの記録に失敗しました" }, { status: 500 });
  }
}
