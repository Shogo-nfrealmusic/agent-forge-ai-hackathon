import Link from "next/link";
import { listBookings } from "@/lib/fixtures/bookings";
import { isAiConfigured } from "@/lib/ai/adapter";

// The AI-configured badge reflects the runtime environment, not build time.
export const dynamic = "force-dynamic";

/** Booking list. Server component — reads fixtures only, no network. */
export default function BookingListPage() {
  const bookings = listBookings();
  const aiConfigured = isAiConfigured();

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-bold tracking-tight">予約一覧（mock）</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          屋外撮影の予約について、天気予報から撮影リスクと対応案を生成します。判断はスタッフが行い、
          このアプリが予約を変更・キャンセルすることはありません。
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
          ai: {aiConfigured ? "live (OpenAI互換)" : "mock (AI_API_KEY 未設定)"}
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
                <span className="text-xs text-slate-500">{booking.durationMinutes}分</span>
              </div>
              <h2 className="mt-2 font-semibold">{booking.plan}</h2>
              <dl className="mt-2 space-y-1 text-sm text-slate-600">
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-slate-400">日時</dt>
                  <dd>
                    {booking.date} {booking.time}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-slate-400">場所</dt>
                  <dd>{booking.location}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-slate-400">顧客</dt>
                  <dd>
                    {booking.customerName}{" "}
                    <span className="text-xs text-slate-400">({booking.customerEmail})</span>
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
