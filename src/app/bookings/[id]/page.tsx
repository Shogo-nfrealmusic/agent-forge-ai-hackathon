import Link from "next/link";
import { notFound } from "next/navigation";
import { findBooking } from "@/lib/fixtures/bookings";
import { findLatestApproval, readAuditLogForBooking } from "@/lib/audit/store";
import { isDecisionEntry } from "@/lib/types";
import { getMessages } from "@/lib/i18n/server";
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

  const [{ locale, m }, history, approval] = await Promise.all([
    getMessages(),
    readAuditLogForBooking(id),
    findLatestApproval(id),
  ]);
  const d = m.detail;

  return (
    <div>
      <Link href="/" className="text-xs text-stone-500 hover:text-stone-900">
        ← {d.back}
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-lg font-semibold tracking-tight">{booking.plan}</h1>
        <span className="font-mono text-[11px] text-stone-400">{booking.bookingId}</span>
      </div>

      <dl className="mt-4 mb-8 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-stone-400">{d.when}</dt>
          <dd className="tnum mt-0.5 font-medium">
            {booking.date} {booking.time}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-stone-400">{d.location}</dt>
          <dd className="mt-0.5 font-medium">{booking.location}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-stone-400">{d.duration}</dt>
          <dd className="tnum mt-0.5 font-medium">
            {booking.durationMinutes} {m.list.minutes} · {booking.timezone}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-stone-400">{d.customer}</dt>
          <dd className="mt-0.5 font-medium">
            {booking.customerName}
            <span className="block font-mono text-[11px] font-normal text-stone-400">
              {booking.customerEmail} · {booking.customerPhone}
            </span>
          </dd>
        </div>
      </dl>

      <AnalysisPanel booking={booking} initiallyApproved={approval !== null} locale={locale} />

      <section className="border-t border-stone-200 py-6">
        <h2 className="text-sm font-semibold">{d.historyTitle}</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-stone-400">{d.historyEmpty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-4 py-2 text-sm">
                {isDecisionEntry(entry) ? (
                  <DecisionBadge decision={entry.decision} label={m.decision[entry.decision]} />
                ) : (
                  <DeliveryBadge
                    status={entry.status}
                    label={`${m.channel[entry.channel]} · ${m.deliveryStatus[entry.status]}`}
                  />
                )}
                <span className="tnum text-xs text-stone-400">
                  {formatTimestamp(entry.recordedAt)}
                </span>
                {isDecisionEntry(entry) ? (
                  entry.reason && (
                    <span className="text-stone-600">
                      {d.reasonPrefix}: {entry.reason}
                    </span>
                  )
                ) : (
                  <span className="font-mono text-[11px] text-stone-400">
                    {entry.destinationMasked} · {entry.mode}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-stone-400">
          {d.seeAudit}{" "}
          <Link href="/audit" className="underline underline-offset-2 hover:text-stone-700">
            {d.auditLink}
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
