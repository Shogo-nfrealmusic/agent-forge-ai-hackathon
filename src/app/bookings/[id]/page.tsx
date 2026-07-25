import Link from "next/link";
import { notFound } from "next/navigation";
import { findBooking } from "@/lib/fixtures/bookings";
import { findLatestApproval, readAuditLogForBooking } from "@/lib/audit/store";
import { isDecisionEntry } from "@/lib/types";
import AnalysisPanel from "@/components/AnalysisPanel";
import { DecisionBadge, DeliveryBadge, formatTimestamp } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const booking = findBooking(id);
  if (!booking) notFound();

  const [history, approval] = await Promise.all([
    readAuditLogForBooking(booking.bookingId),
    findLatestApproval(booking.bookingId),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-block text-sm text-slate-600 hover:underline">
        &larr; Back to bookings
      </Link>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold tracking-tight">{booking.plan}</h1>
          <span className="font-mono text-xs text-slate-500">{booking.bookingId}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">When</dt>
            <dd className="mt-0.5 font-semibold">
              {booking.date} {booking.time}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Time zone</dt>
            <dd className="mt-0.5 font-semibold">{booking.timezone}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Duration</dt>
            <dd className="mt-0.5 font-semibold">{booking.durationMinutes} min</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Location</dt>
            <dd className="mt-0.5 font-semibold">{booking.location}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Coordinates</dt>
            <dd className="mt-0.5 font-mono text-xs">
              {booking.latitude}, {booking.longitude}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Customer (dummy)</dt>
            <dd className="mt-0.5 font-semibold">
              {booking.customerName}
              <span className="block text-xs font-normal text-slate-500">
                {booking.customerEmail}
              </span>
              <span className="block text-xs font-normal text-slate-500">
                {booking.customerPhone}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <AnalysisPanel booking={booking} initiallyApproved={approval !== null} />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold">History for this booking</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {isDecisionEntry(entry) ? (
                    <DecisionBadge decision={entry.decision} />
                  ) : (
                    <DeliveryBadge channel={entry.channel} status={entry.status} />
                  )}
                  <span className="text-xs text-slate-500">
                    {formatTimestamp(entry.recordedAt)}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-slate-400">
                    {isDecisionEntry(entry)
                      ? `rule:${entry.deterministicRiskLevel} / ai:${entry.aiRiskLevel}`
                      : `to:${entry.destinationMasked} / ${entry.mode}`}
                  </span>
                </div>
                {isDecisionEntry(entry) && entry.reason && (
                  <p className="mt-1 text-slate-700">Reason: {entry.reason}</p>
                )}
                {!isDecisionEntry(entry) && entry.errorReason && (
                  <p className="mt-1 text-xs text-slate-600">{entry.errorReason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          See every entry in the{" "}
          <Link href="/audit" className="underline">
            audit log
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
