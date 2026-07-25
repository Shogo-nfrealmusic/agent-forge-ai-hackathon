import Link from "next/link";
import { isAuditLogEphemeral, readAuditLog } from "@/lib/audit/store";
import { isDecisionEntry } from "@/lib/types";
import { getMessages } from "@/lib/i18n/server";
import { DecisionBadge, DeliveryBadge, RiskBadge, formatTimestamp } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const [{ m }, entries] = await Promise.all([getMessages(), readAuditLog()]);
  const a = m.audit;
  const ephemeral = isAuditLogEphemeral();

  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight">{a.title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone-500">{a.subtitle}</p>

      {ephemeral && <p className="mt-3 text-xs text-amber-700">{a.ephemeral}</p>}

      {entries.length === 0 ? (
        <p className="mt-8 text-sm text-stone-400">
          {a.empty}{" "}
          <Link href="/" className="underline underline-offset-2 hover:text-stone-700">
            →
          </Link>
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-stone-100 border-t border-stone-200">
          {entries.map((entry) => (
            <li key={entry.id} className="py-3">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                {isDecisionEntry(entry) ? (
                  <DecisionBadge decision={entry.decision} label={m.decision[entry.decision]} />
                ) : (
                  <DeliveryBadge
                    status={entry.status}
                    label={`${m.channel[entry.channel]} · ${m.deliveryStatus[entry.status]}`}
                  />
                )}
                <Link
                  href={`/bookings/${entry.bookingId}`}
                  className="font-mono text-[11px] text-stone-500 underline underline-offset-2 hover:text-stone-800"
                >
                  {entry.bookingId}
                </Link>
                <span className="tnum text-xs text-stone-400">
                  {formatTimestamp(entry.recordedAt)}
                </span>
                {isDecisionEntry(entry) && entry.agreement === "needs_check" && (
                  <span className="text-[11px] font-semibold text-amber-700">{a.needsCheck}</span>
                )}
              </div>

              {isDecisionEntry(entry) ? (
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-5 text-xs text-stone-500">
                  <span className="flex items-baseline gap-1.5">
                    {a.rules} <RiskBadge level={entry.deterministicRiskLevel} size="sm" />
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    {a.ai} <RiskBadge level={entry.aiRiskLevel} size="sm" />
                  </span>
                  <span>
                    {a.recommended}: {m.recommendation[entry.aiRecommendation]}
                  </span>
                  <span className="font-mono text-[11px] text-stone-400">
                    weather:{entry.weatherSource} · ai:{entry.aiSource}
                  </span>
                </div>
              ) : (
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-5 text-xs text-stone-500">
                  <span className="font-mono">{entry.destinationMasked}</span>
                  <span>
                    {a.mode}: {entry.mode}
                    {entry.provider ? ` (${entry.provider})` : ""}
                  </span>
                  <span className="tnum">
                    {a.msgLen}: {entry.messageLength} {a.chars}
                  </span>
                  <span className="font-mono text-[11px] text-stone-400">
                    {a.approvedByDecision} {entry.decisionEntryId.slice(0, 8)}
                  </span>
                </div>
              )}

              {isDecisionEntry(entry) && entry.reason && (
                <p className="mt-1.5 text-sm text-stone-600">
                  {a.reason}: {entry.reason}
                </p>
              )}
              {!isDecisionEntry(entry) && entry.errorReason && (
                <p className="mt-1.5 text-xs text-stone-500">{entry.errorReason}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
