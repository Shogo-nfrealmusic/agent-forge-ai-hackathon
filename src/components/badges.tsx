import type { Recommendation, RiskLevel, StaffDecision } from "@/lib/types";

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

export function RiskBadge({
  level,
  size = "md",
}: {
  level: RiskLevel;
  size?: "sm" | "md";
}) {
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
  keep: "予定どおり実施 (keep)",
  reschedule: "別日へ振替を提案 (reschedule)",
  plan_change: "プラン・ロケーション変更を提案 (plan_change)",
  contact_staff: "スタッフ確認が必要 (contact_staff)",
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
        ルール判定と一致
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-400">
      要確認（AI判定とルール判定が不一致）
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
