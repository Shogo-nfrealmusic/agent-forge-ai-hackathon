import Link from "next/link";
import { notFound } from "next/navigation";
import { findBooking } from "@/lib/fixtures/bookings";
import { readAuditLogForBooking } from "@/lib/audit/store";
import AnalysisPanel from "@/components/AnalysisPanel";
import { DecisionBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const booking = findBooking(id);
  if (!booking) notFound();

  const history = await readAuditLogForBooking(booking.bookingId);

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-block text-sm text-slate-600 hover:underline">
        ← 予約一覧へ戻る
      </Link>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold tracking-tight">{booking.plan}</h1>
          <span className="font-mono text-xs text-slate-500">{booking.bookingId}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">日時</dt>
            <dd className="mt-0.5 font-semibold">
              {booking.date} {booking.time}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">タイムゾーン</dt>
            <dd className="mt-0.5 font-semibold">{booking.timezone}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">所要時間</dt>
            <dd className="mt-0.5 font-semibold">{booking.durationMinutes}分</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">ロケーション</dt>
            <dd className="mt-0.5 font-semibold">{booking.location}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">座標</dt>
            <dd className="mt-0.5 font-mono text-xs">
              {booking.latitude}, {booking.longitude}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">顧客（ダミー）</dt>
            <dd className="mt-0.5 font-semibold">
              {booking.customerName}
              <span className="block text-xs font-normal text-slate-500">
                {booking.customerEmail}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <AnalysisPanel booking={booking} />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold">この予約の判断履歴</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">まだ記録がありません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <DecisionBadge decision={entry.decision} />
                  <span className="text-xs text-slate-500">
                    {new Date(entry.recordedAt).toLocaleString("ja-JP")}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-slate-400">
                    rule:{entry.deterministicRiskLevel} / ai:{entry.aiRiskLevel}
                  </span>
                </div>
                {entry.reason && <p className="mt-1 text-slate-700">理由: {entry.reason}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          全件は <Link href="/audit" className="underline">監査ログ</Link> で確認できます。
        </p>
      </section>
    </div>
  );
}
