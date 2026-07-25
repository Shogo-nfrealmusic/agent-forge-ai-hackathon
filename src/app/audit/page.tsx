import Link from "next/link";
import { readAuditLog } from "@/lib/audit/store";
import { DecisionBadge, RECOMMENDATION_LABEL, RiskBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const entries = await readAuditLog();

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-xl font-bold tracking-tight">監査ログ</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          スタッフの判断をローカルファイル（<code className="font-mono text-xs">.data/audit-log.jsonl</code>
          ）に追記した記録です。いずれの記録も予約システムへの変更を伴いません（
          <code className="font-mono text-xs">bookingSystemMutated: false</code>）。
        </p>
      </section>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          記録がありません。
          <Link href="/" className="ml-1 underline">
            予約一覧
          </Link>
          から予約を開き、Approve / Reject / Needs discussion を押してください。
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <DecisionBadge decision={entry.decision} />
                <Link
                  href={`/bookings/${entry.bookingId}`}
                  className="font-mono text-xs text-slate-600 underline"
                >
                  {entry.bookingId}
                </Link>
                <span className="text-xs text-slate-500">
                  {new Date(entry.recordedAt).toLocaleString("ja-JP")}
                </span>
                {entry.agreement === "needs_check" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-400">
                    要確認
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">ルール判定</span>
                  <RiskBadge level={entry.deterministicRiskLevel} size="sm" />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">AI判定</span>
                  <RiskBadge level={entry.aiRiskLevel} size="sm" />
                </span>
                <span className="text-xs text-slate-600">
                  推奨: {RECOMMENDATION_LABEL[entry.aiRecommendation]}
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  weather:{entry.weatherSource} / ai:{entry.aiSource}
                </span>
              </div>

              {entry.reason && (
                <p className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-xs font-semibold text-slate-500">理由: </span>
                  {entry.reason}
                </p>
              )}

              <p className="mt-2 font-mono text-[11px] text-slate-400">{entry.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
