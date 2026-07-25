import type {
  DeliveryChannel,
  DeliveryStatus,
  Recommendation,
  RiskLevel,
  StaffDecision,
} from "@/lib/types";

const RISK_STYLE: Record<RiskLevel, string> = {
  low: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  medium: "bg-amber-100 text-amber-900 ring-amber-300",
  high: "bg-rose-100 text-rose-900 ring-rose-300",
};

const RISK_LABEL: Record<RiskLevel, string> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
};

export function RiskBadge({ level, size = "md" }: { level: RiskLevel; size?: "sm" | "md" }) {
  const sizing = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold tracking-wide ring-1 ${RISK_STYLE[level]} ${sizing}`}
    >
      {RISK_LABEL[level]}
    </span>
  );
}

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  keep: "Go ahead as planned (keep)",
  reschedule: "Offer another date (reschedule)",
  plan_change: "Offer a plan or location change (plan_change)",
  contact_staff: "Needs a staff decision (contact_staff)",
};

export const DECISION_LABEL: Record<StaffDecision, string> = {
  approved: "Approve",
  rejected: "Reject",
  needs_discussion: "Needs discussion",
};

const DECISION_STYLE: Record<StaffDecision, string> = {
  approved: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  rejected: "bg-rose-100 text-rose-900 ring-rose-300",
  needs_discussion: "bg-sky-100 text-sky-900 ring-sky-300",
};

export function DecisionBadge({ decision }: { decision: StaffDecision }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${DECISION_STYLE[decision]}`}
    >
      {DECISION_LABEL[decision]}
    </span>
  );
}

export function AgreementBadge({ agreement }: { agreement: "agree" | "needs_check" }) {
  if (agreement === "agree") {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300">
        Matches the rule result
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-400">
      NEEDS CHECK — AI and rules disagree
    </span>
  );
}

export function SourceBadge({ label, degraded }: { label: string; degraded?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[11px] ring-1 ${
        degraded
          ? "bg-amber-50 text-amber-900 ring-amber-300"
          : "bg-slate-100 text-slate-600 ring-slate-300"
      }`}
    >
      {label}
    </span>
  );
}

export const CHANNEL_LABEL: Record<DeliveryChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
};

const DELIVERY_STATUS_STYLE: Record<DeliveryStatus, string> = {
  sent: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  prepared: "bg-slate-100 text-slate-700 ring-slate-300",
  failed: "bg-rose-100 text-rose-900 ring-rose-300",
};

const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  sent: "Sent",
  prepared: "Prepared (not sent)",
  failed: "Failed",
};

export function DeliveryBadge({
  channel,
  status,
}: {
  channel: DeliveryChannel;
  status: DeliveryStatus;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${DELIVERY_STATUS_STYLE[status]}`}
    >
      {CHANNEL_LABEL[channel]} · {DELIVERY_STATUS_LABEL[status]}
    </span>
  );
}

/** ISO timestamp → "2026-07-25 13:40 UTC". Locale-independent on purpose. */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}
