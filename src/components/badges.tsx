import type { DeliveryStatus, RiskLevel } from "@/lib/types";

/**
 * Minimal status marks: a small coloured dot plus plain text. Colour is used
 * for risk state only — everything else stays in the grey scale.
 */

const RISK_DOT: Record<RiskLevel, string> = {
  low: "bg-emerald-600",
  medium: "bg-amber-500",
  high: "bg-red-600",
};

const RISK_TEXT: Record<RiskLevel, string> = {
  low: "text-stone-600",
  medium: "text-amber-700",
  high: "text-red-700",
};

export function RiskBadge({ level, size = "md" }: { level: RiskLevel; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium ${RISK_TEXT[level]} ${
        size === "sm" ? "text-[11px]" : "text-xs"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${RISK_DOT[level]}`} />
      {level.toUpperCase()}
    </span>
  );
}

const DECISION_DOT: Record<string, string> = {
  approved: "bg-emerald-600",
  rejected: "bg-red-600",
  needs_discussion: "bg-stone-400",
};

/** Label is passed in so the caller can localise it. */
export function DecisionBadge({ decision, label }: { decision: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700">
      <span className={`h-1.5 w-1.5 rounded-full ${DECISION_DOT[decision] ?? "bg-stone-400"}`} />
      {label}
    </span>
  );
}

const DELIVERY_DOT: Record<DeliveryStatus, string> = {
  sent: "bg-emerald-600",
  prepared: "bg-stone-400",
  failed: "bg-red-600",
};

export function DeliveryBadge({
  status,
  label,
}: {
  status: DeliveryStatus;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700">
      <span className={`h-1.5 w-1.5 rounded-full ${DELIVERY_DOT[status]}`} />
      {label}
    </span>
  );
}

/** Quiet technical annotation (data source, latency, …). */
export function SourceBadge({ label, degraded }: { label: string; degraded?: boolean }) {
  return (
    <span
      className={`font-mono text-[11px] ${degraded ? "text-amber-700" : "text-stone-400"}`}
    >
      {label}
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
