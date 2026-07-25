"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AnalysisResult,
  Booking,
  DecisionAuditEntry,
  DeliveryAuditEntry,
  DeliveryChannel,
  DeliveryResult,
  StaffDecision,
  WindowAnalysis,
} from "@/lib/types";
import { RiskBadge, SourceBadge } from "@/components/badges";
import { messages, type Locale } from "@/lib/i18n/messages";
import {
  buildEmailSubject,
  buildMailtoLink,
  buildWhatsAppLink,
} from "@/lib/delivery/contact";

/**
 * Client panel: runs the fast analysis (/api/analyze) and the slow sandbox
 * analysis (/api/windows) in parallel, records staff decisions
 * (/api/decisions), and hands off / sends the customer message (/api/deliver).
 *
 * No secret ever reaches this component — it talks only to same-origin routes
 * and pure link builders. It must never import the AI adapter, the audit store
 * or the WhatsApp adapter (enforced by tests/no-secret-exposure.test.ts).
 *
 * UI language follows the `locale` prop; customer message drafts stay English.
 */

type Phase = "loading" | "ready" | "error";

export default function AnalysisPanel({
  booking,
  initiallyApproved,
  locale,
}: {
  booking: Booking;
  initiallyApproved: boolean;
  locale: Locale;
}) {
  const m = messages[locale];
  const p = m.panel;
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [windows, setWindows] = useState<WindowAnalysis | null>(null);
  const [windowsPhase, setWindowsPhase] = useState<Phase>("loading");
  const [windowsError, setWindowsError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<StaffDecision | null>(null);
  const [recorded, setRecorded] = useState<DecisionAuditEntry | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [approved, setApproved] = useState(initiallyApproved);

  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<DeliveryChannel>("whatsapp");
  const [sending, setSending] = useState(false);
  const [delivery, setDelivery] = useState<{
    result: DeliveryResult;
    entry: DeliveryAuditEntry;
  } | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runAnalysis = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.bookingId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AnalysisResult;
      setResult(data);
      setMessage(data.ai.recommendation.customerMessage);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setPhase("error");
    }
  }, [booking.bookingId]);

  const runWindowAnalysis = useCallback(async () => {
    setWindowsPhase("loading");
    setWindowsError(null);
    try {
      const res = await fetch("/api/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.bookingId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { windows: WindowAnalysis | null };
      setWindows(body.windows);
      setWindowsPhase("ready");
    } catch (err) {
      setWindowsError(err instanceof Error ? err.message : "Unknown error");
      setWindowsPhase("error");
    }
  }, [booking.bookingId]);

  useEffect(() => {
    // Both start at once; each renders as soon as it lands.
    void runAnalysis();
    void runWindowAnalysis();
  }, [runAnalysis, runWindowAnalysis]);

  async function submitDecision(decision: StaffDecision) {
    if (!result) return;
    if (decision === "rejected" && reason.trim() === "") {
      setSubmitError(p.reasonMissing);
      return;
    }
    setSubmitting(decision);
    setSubmitError(null);
    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.bookingId,
          decision,
          reason: reason.trim() || null,
          deterministicRiskLevel: result.deterministic.riskLevel,
          aiRiskLevel: result.ai.recommendation.riskLevel,
          aiRecommendation: result.ai.recommendation.recommendation,
          agreement: result.agreement,
          weatherSource: result.weather.source,
          aiSource: result.ai.source,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        entry?: DecisionAuditEntry;
        error?: string;
      };
      if (!res.ok || !body.entry) throw new Error(body.error ?? `HTTP ${res.status}`);
      setRecorded(body.entry);
      setReason("");
      if (decision === "approved") setApproved(true);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to record");
    } finally {
      setSubmitting(null);
    }
  }

  async function sendMessage() {
    setSending(true);
    setDeliveryError(null);
    try {
      const res = await fetch("/api/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.bookingId, channel, message }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        result?: DeliveryResult;
        entry?: DeliveryAuditEntry;
        error?: string;
      };
      if (!res.ok || !body.result || !body.entry) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setDelivery({ result: body.result, entry: body.entry });
      router.refresh();
    } catch (err) {
      setDeliveryError(err instanceof Error ? err.message : "Delivery failed");
    } finally {
      setSending(false);
    }
  }

  /* ---------------------------------------------------------------------- */

  if (phase === "loading") {
    return (
      <section className="border-t border-stone-200 py-8">
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
          {p.loading}
        </div>
      </section>
    );
  }

  if (phase === "error" || !result) {
    return (
      <section className="border-t border-stone-200 py-8">
        <p className="text-sm font-medium text-red-700">{p.failed}</p>
        <p className="mt-1 text-sm text-stone-500">{error}</p>
        <button
          type="button"
          onClick={() => void runAnalysis()}
          className="mt-4 border border-stone-300 px-4 py-1.5 text-sm hover:bg-white"
        >
          {p.retry}
        </button>
      </section>
    );
  }

  const { weather, deterministic, ai } = result;
  const wind = Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh);
  const whatsappProvider = result.delivery.providers.find((c) => c.channel === "whatsapp");
  const canSendViaProvider = Boolean(whatsappProvider?.configured) && channel === "whatsapp";
  const targets = result.delivery.targets;

  const handoffLink =
    channel === "whatsapp"
      ? buildWhatsAppLink(targets.whatsapp, message)
      : buildMailtoLink(targets.email, buildEmailSubject(booking.plan, booking.date), message);

  const stat = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="tnum mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );

  return (
    <div>
      {result.agreement === "needs_check" && (
        <div className="border-l-2 border-amber-500 bg-amber-50/60 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            {p.needsCheckTitle(
              ai.recommendation.riskLevel.toUpperCase(),
              deterministic.riskLevel.toUpperCase(),
            )}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {p.needsCheckBody(result.effectiveRiskLevel.toUpperCase())}
          </p>
        </div>
      )}

      {/* --- Weather ------------------------------------------------------ */}
      <section className="border-t border-stone-200 py-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold">{p.weatherTitle}</h2>
          <SourceBadge
            label={weather.source === "open-meteo" ? p.sourceLive : p.sourceFixture}
            degraded={weather.degraded}
          />
        </div>
        {weather.degraded && (
          <p className="mt-2 text-xs text-amber-700">
            {p.fallbackPrefix} {weather.fallbackReason}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
          {stat(p.conditions, weather.conditionLabel)}
          {stat(p.rain, `${weather.precipitationProbabilityMax}%`)}
          {stat(p.wind, `${wind} km/h`)}
          {stat(p.temp, `${weather.temperatureC}°C`)}
          {stat(p.precip, `${weather.precipitationMm} mm`)}
        </dl>
        {weather.alerts.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="text-[11px] uppercase tracking-wide text-stone-400">
              {p.warnings}
            </span>{" "}
            <span className="font-medium text-red-700">{weather.alerts.join(" / ")}</span>
          </p>
        )}
      </section>

      {/* --- Rules vs AI -------------------------------------------------- */}
      <div className="grid gap-x-10 border-t border-stone-200 py-6 sm:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">{p.rulesTitle}</h2>
            <RiskBadge level={deterministic.riskLevel} />
          </div>
          <p className="mt-1 text-xs text-stone-400">{p.rulesHint}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {deterministic.hits.length === 0 ? (
              <li className="text-stone-500">{deterministic.reason}</li>
            ) : (
              deterministic.hits.map((hit) => (
                <li key={hit.id} className="flex items-baseline gap-2">
                  <RiskBadge level={hit.level} size="sm" />
                  <span>
                    <span className="font-medium">{hit.label}</span>
                    <span className="block text-xs text-stone-500">{hit.detail}</span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="mt-6 sm:mt-0">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">{p.aiTitle}</h2>
            <RiskBadge level={ai.recommendation.riskLevel} />
          </div>
          <p className="mt-1 space-x-3">
            <SourceBadge
              label={
                ai.source === "live" ? `ai: ${ai.provider ?? "live"} (${ai.model ?? ""})` : p.aiMock
              }
              degraded={ai.source === "mock"}
            />
            <SourceBadge label={`${p.confidence}: ${ai.recommendation.confidence.toFixed(2)}`} />
          </p>
          {ai.fallbackReason && (
            <p className="mt-2 text-xs text-amber-700">{ai.fallbackReason}</p>
          )}
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-stone-400">
                {p.recommendedAction}
              </dt>
              <dd className="mt-0.5 font-medium">
                {m.recommendation[ai.recommendation.recommendation]}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-stone-400">{p.reasoning}</dt>
              <dd className="mt-0.5 leading-relaxed text-stone-600">{ai.recommendation.summary}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-stone-400">{p.reviewNote}</p>
        </section>
      </div>

      {/* --- Alternative windows (Daytona) -------------------------------- */}
      <section className="border-t border-stone-200 py-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold">{p.windowsTitle}</h2>
          {windowsPhase === "ready" && windows && (
            <SourceBadge
              label={windows.source === "daytona-sandbox" ? p.windowsSandbox : p.windowsLocal}
              degraded={windows.source === "local-trusted"}
            />
          )}
          {windows?.executionMs !== undefined && (
            <SourceBadge label={`${windows.executionMs} ms`} />
          )}
        </div>

        {windowsPhase === "loading" && (
          <div className="mt-3 flex items-center gap-3 text-sm text-stone-500">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
            {p.windowsLoading}
          </div>
        )}

        {windowsPhase === "error" && (
          <div className="mt-3">
            <p className="text-sm text-amber-800">
              {p.windowsFailed} — {windowsError}
            </p>
            <button
              type="button"
              onClick={() => void runWindowAnalysis()}
              className="mt-2 border border-stone-300 px-3 py-1 text-xs hover:bg-white"
            >
              {p.retry}
            </button>
          </div>
        )}

        {windowsPhase === "ready" && windows && (
          <div className="mt-3">
            <p className="max-w-2xl text-xs leading-relaxed text-stone-400">{p.windowsHint}</p>
            {windows.fallbackReason && (
              <p className="mt-2 text-xs text-amber-700">{windows.fallbackReason}</p>
            )}

            <div className="mt-4 grid gap-x-10 gap-y-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-stone-400">
                  {p.currentBooked}
                </p>
                {windows.current ? (
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                    <span className="tnum text-lg font-semibold">
                      {windows.current.start}–{windows.current.end}
                    </span>
                    <RiskBadge level={windows.current.riskLevel} size="sm" />
                    <span className="tnum text-sm text-stone-500">
                      {windows.current.precipitationProbabilityMax}% ·{" "}
                      {windows.current.windSpeedMaxKmh} km/h
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-stone-400">{p.notInForecast}</p>
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-stone-400">{p.bestAlt}</p>
                {windows.best ? (
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                    <span className="tnum text-lg font-semibold text-emerald-800">
                      {windows.best.start}–{windows.best.end}
                    </span>
                    <RiskBadge level={windows.best.riskLevel} size="sm" />
                    <span className="tnum text-sm text-stone-500">
                      {windows.best.precipitationProbabilityMax}% · {windows.best.windSpeedMaxKmh}{" "}
                      km/h
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-stone-500">{p.noneBetter}</p>
                )}
              </div>
            </div>

            {windows.alternatives.length > 0 && (
              <p className="tnum mt-3 text-xs text-stone-500">
                {p.ranked}:{" "}
                {windows.alternatives
                  .map((w) => `${w.start} (${w.precipitationProbabilityMax}%)`)
                  .join(" · ")}
              </p>
            )}

            {windows.generatedCode && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowCode((v) => !v)}
                  className="text-xs text-stone-500 underline underline-offset-2 hover:text-stone-800"
                >
                  {showCode ? p.hideCode : p.showCode}
                </button>
                {showCode && (
                  <pre className="mt-2 max-h-72 overflow-auto border border-stone-200 bg-white p-3 font-mono text-xs leading-relaxed text-stone-700">
                    {windows.generatedCode}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* --- Staff decision ----------------------------------------------- */}
      <section className="border-t border-stone-200 py-6">
        <h2 className="text-sm font-semibold">{p.decisionTitle}</h2>
        <p className="mt-1 max-w-2xl text-xs text-stone-400">{p.decisionHint}</p>

        <label className="mt-4 block max-w-2xl">
          <span className="text-xs font-medium">
            {p.reasonLabel} <span className="font-normal text-stone-400">{p.reasonRequired}</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={p.reasonPlaceholder}
            className="mt-1 w-full border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => void submitDecision("approved")}
            className="bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          >
            {submitting === "approved" ? p.recording : m.decision.approved}
          </button>
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => void submitDecision("rejected")}
            className="border border-red-300 px-5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            {submitting === "rejected" ? p.recording : m.decision.rejected}
          </button>
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => void submitDecision("needs_discussion")}
            className="border border-stone-300 px-5 py-2 text-sm font-medium text-stone-700 hover:bg-white disabled:opacity-40"
          >
            {submitting === "needs_discussion" ? p.recording : m.decision.needs_discussion}
          </button>
        </div>

        {submitError && <p className="mt-3 text-sm text-red-700">{submitError}</p>}

        {recorded && (
          <div className="mt-4 border-l-2 border-emerald-600 pl-3 text-sm">
            <p className="font-medium text-emerald-900">
              {p.recordedTitle} — {m.decision[recorded.decision]}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-stone-400">
              id: {recorded.id} · bookingSystemMutated: {String(recorded.bookingSystemMutated)}
            </p>
          </div>
        )}
      </section>

      {/* --- Customer message + delivery ----------------------------------- */}
      <section className="border-t border-stone-200 py-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold">{p.messageTitle}</h2>
          <span
            className={`text-[11px] font-medium ${approved ? "text-emerald-700" : "text-stone-400"}`}
          >
            {approved ? p.unlocked : p.locked}
          </span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(message)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
                .catch(() => setCopied(false));
            }}
            className="ml-auto text-xs text-stone-500 underline underline-offset-2 hover:text-stone-800"
          >
            {copied ? p.copied : p.copy}
          </button>
        </div>
        <p className="mt-1 text-xs text-stone-400">
          {p.draftHint} {p.messageEnglishNote}
        </p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={9}
          className="mt-3 w-full border border-stone-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed focus:border-stone-500 focus:outline-none"
        />

        {!approved ? (
          <p className="mt-3 max-w-2xl text-xs text-stone-500">{p.lockedNote}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {targets.overridden && (
              <p className="border-l-2 border-red-500 pl-3 text-xs font-medium text-red-800">
                {p.overrideBanner}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-xs font-medium">{p.channel}</span>
              {(["whatsapp", "email"] as DeliveryChannel[]).map((c) => (
                <label key={c} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="channel"
                    checked={channel === c}
                    onChange={() => {
                      setChannel(c);
                      setDelivery(null);
                      setDeliveryError(null);
                    }}
                  />
                  {m.channel[c]}
                  <span className="font-mono text-xs text-stone-400">
                    {c === "whatsapp" ? targets.whatsapp : targets.email}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={handoffLink}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700"
              >
                {channel === "whatsapp" ? p.openWhatsApp : p.openEmail}
              </a>
              <button
                type="button"
                disabled={!canSendViaProvider || sending || message.trim() === ""}
                onClick={() => void sendMessage()}
                className="border border-stone-300 px-5 py-2 text-sm font-medium text-stone-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? p.sending : p.sendProvider}
              </button>
            </div>

            <p className="max-w-2xl text-xs leading-relaxed text-stone-400">
              {p.handoffExplain}{" "}
              {whatsappProvider?.configured
                ? whatsappProvider.realSendEnabled
                  ? p.providerLive(whatsappProvider.provider ?? "provider")
                  : p.providerLocked(whatsappProvider.provider ?? "provider")
                : p.providerDisabled}
            </p>

            {deliveryError && <p className="text-sm text-red-700">{deliveryError}</p>}

            {delivery && (
              <div
                className={`border-l-2 pl-3 text-sm ${
                  delivery.result.status === "sent"
                    ? "border-emerald-600"
                    : delivery.result.status === "failed"
                      ? "border-red-600"
                      : "border-stone-400"
                }`}
              >
                <p className="font-medium">
                  {m.channel[delivery.result.channel]} ·{" "}
                  {m.deliveryStatus[delivery.result.status]} · {delivery.result.mode}
                </p>
                {delivery.result.errorReason && (
                  <p className="mt-0.5 text-xs text-stone-500">{delivery.result.errorReason}</p>
                )}
                <p className="mt-0.5 font-mono text-[11px] text-stone-400">
                  {p.deliveredTo}: {delivery.result.destinationMasked} · {p.auditId}:{" "}
                  {delivery.entry.id.slice(0, 8)}
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
