import Link from "next/link";
import { listBookings } from "@/lib/fixtures/bookings";
import { isAiConfigured } from "@/lib/ai/adapter";
import { describeWhatsAppProvider } from "@/lib/delivery/whatsapp";

// The capability badges reflect the runtime environment, not build time.
export const dynamic = "force-dynamic";

/** Booking list. Server component — reads fixtures only, no network. */
export default function BookingListPage() {
  const bookings = listBookings();
  const aiConfigured = isAiConfigured();
  const whatsapp = describeWhatsAppProvider();

  const deliveryLabel = !whatsapp.configured
    ? "delivery: link hand-off only"
    : whatsapp.realSendEnabled
      ? `delivery: LIVE via ${whatsapp.provider}`
      : `delivery: ${whatsapp.provider} configured, sending locked`;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-bold tracking-tight">Bookings (mock data)</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          For each outdoor shoot, this agent assesses the weather risk and drafts a message for the
          customer. A staff member makes the call — the agent never changes or cancels a booking,
          and nothing is sent to a customer until it has been approved.
        </p>
      </section>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-white px-2.5 py-1 font-mono text-slate-600 ring-1 ring-slate-300">
          bookings: fixture ({bookings.length})
        </span>
        <span className="rounded bg-white px-2.5 py-1 font-mono text-slate-600 ring-1 ring-slate-300">
          weather: Open-Meteo → fixture fallback
        </span>
        <span
          className={`rounded px-2.5 py-1 font-mono ring-1 ${
            aiConfigured
              ? "bg-white text-slate-600 ring-slate-300"
              : "bg-amber-50 text-amber-900 ring-amber-300"
          }`}
        >
          ai: {aiConfigured ? "live (OpenAI-compatible)" : "mock (AI_API_KEY not set)"}
        </span>
        <span
          className={`rounded px-2.5 py-1 font-mono ring-1 ${
            whatsapp.configured && whatsapp.realSendEnabled
              ? "bg-rose-50 text-rose-900 ring-rose-300"
              : "bg-white text-slate-600 ring-slate-300"
          }`}
        >
          {deliveryLabel}
        </span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {bookings.map((booking) => (
          <li key={booking.bookingId}>
            <Link
              href={`/bookings/${booking.bookingId}`}
              className="block h-full rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-400 hover:shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-slate-500">{booking.bookingId}</span>
                <span className="text-xs text-slate-500">{booking.durationMinutes} min</span>
              </div>
              <h2 className="mt-2 font-semibold">{booking.plan}</h2>
              <dl className="mt-2 space-y-1 text-sm text-slate-600">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-400">When</dt>
                  <dd>
                    {booking.date} {booking.time}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-400">Where</dt>
                  <dd>{booking.location}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-slate-400">Customer</dt>
                  <dd>
                    {booking.customerName}
                    <span className="block text-xs text-slate-400">
                      {booking.customerEmail} · {booking.customerPhone}
                    </span>
                  </dd>
                </div>
              </dl>
              {booking.notes && (
                <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  {booking.notes}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
