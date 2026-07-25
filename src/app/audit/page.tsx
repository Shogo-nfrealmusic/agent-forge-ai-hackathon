import Link from "next/link";
import { isAuditLogEphemeral, readAuditLog } from "@/lib/audit/store";
import { isDecisionEntry } from "@/lib/types";
import {
  DecisionBadge,
  DeliveryBadge,
  RECOMMENDATION_LABEL,
  RiskBadge,
  formatTimestamp,
} from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const entries = await readAuditLog();
  const ephemeral = isAuditLogEphemeral();

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Every staff decision and every message delivery, appended to a local file (
          <code className="font-mono text-xs">.data/audit-log.jsonl</code>). No entry changes a
          booking (<code className="font-mono text-xs">bookingSystemMutated: false</code>).
          Destinations are masked and message bodies are never stored — only their length.
        </p>
      </section>

      {ephemeral && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This deployment writes the log to <code className="font-mono">/tmp</code>, which is
          ephemeral and per-instance on serverless hosting — entries can disappear on a cold start.
          A real deployment must point the audit log at a database. See docs/security.md.
        </p>
      )}

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nothing recorded yet. Open a booking from the{" "}
          <Link href="/" className="underline">
            booking list
          </Link>{" "}
          and choose Approve, Reject or Needs discussion.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                {isDecisionEntry(entry) ? (
                  <DecisionBadge decision={entry.decision} />
                ) : (
                  <DeliveryBadge channel={entry.channel} status={entry.status} />
                )}
                <Link
                  href={`/bookings/${entry.bookingId}`}
                  className="font-mono text-xs text-slate-600 underline"
                >
                  {entry.bookingId}
                </Link>
                <span className="text-xs text-slate-500">{formatTimestamp(entry.recordedAt)}</span>
                {isDecisionEntry(entry) && entry.agreement === "needs_check" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-400">
                    NEEDS CHECK
                  </span>
                )}
              </div>

              {isDecisionEntry(entry) ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">Rules</span>
                    <RiskBadge level={entry.deterministicRiskLevel} size="sm" />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">AI</span>
                    <RiskBadge level={entry.aiRiskLevel} size="sm" />
                  </span>
                  <span className="text-xs text-slate-600">
                    Recommended: {RECOMMENDATION_LABEL[entry.aiRecommendation]}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    weather:{entry.weatherSource} / ai:{entry.aiSource}
                  </span>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span className="text-xs text-slate-600">
                    To: <span className="font-mono">{entry.destinationMasked}</span>
                  </span>
                  <span className="text-xs text-slate-600">
                    Mode: <span className="font-mono">{entry.mode}</span>
                    {entry.provider ? ` (${entry.provider})` : ""}
                  </span>
                  <span className="text-xs text-slate-600">
                    Message length: {entry.messageLength} chars
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    approved by decision {entry.decisionEntryId.slice(0, 8)}…
                  </span>
                </div>
              )}

              {isDecisionEntry(entry) && entry.reason && (
                <p className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-xs font-semibold text-slate-500">Reason: </span>
                  {entry.reason}
                </p>
              )}

              {!isDecisionEntry(entry) && entry.errorReason && (
                <p className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  {entry.errorReason}
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
