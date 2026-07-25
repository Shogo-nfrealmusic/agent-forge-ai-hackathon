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
import {
  AgreementBadge,
  CHANNEL_LABEL,
  DECISION_LABEL,
  RECOMMENDATION_LABEL,
  RiskBadge,
  SourceBadge,
} from "@/components/badges";
import {
  buildEmailSubject,
  buildMailtoLink,
  buildWhatsAppLink,
} from "@/lib/delivery/contact";

/**
 * Client panel: runs the analysis via /api/analyze, records the staff decision
 * via /api/decisions, and hands off / sends the customer message via
 * /api/deliver.
 *
 * No secret ever reaches this component — it only talks to same-origin routes
 * and to pure link builders. It must never import the AI adapter, the audit
 * store or the WhatsApp adapter (enforced by tests/no-secret-exposure.test.ts).
 */

type Phase = "loading" | "ready" | "error";

const DECISION_BUTTONS: { decision: StaffDecision; className: string; hint: string }[] = [
  {
    decision: "approved",
    className: "bg-emerald-600 hover:bg-emerald-700",
    hint: "Agree with the recommendation. Recorded in the audit log; the booking is not changed.",
  },
  {
    decision: "rejected",
    className: "bg-rose-600 hover:bg-rose-700",
    hint: "Reject the recommendation. A reason is required.",
  },
  {
    decision: "needs_discussion",
    className: "bg-sky-600 hover:bg-sky-700",
    hint: "Record it as needing a team discussion.",
  },
];

export default function AnalysisPanel({
  booking,
  initiallyApproved,
}: {
  booking: Booking;
  initiallyApproved: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const [showCode, setShowCode] = useState(false);

  // The window analysis is fetched separately: code generation plus sandbox
  // startup takes ~20s, and the risk assessment should not wait behind it.
  const [windows, setWindows] = useState<WindowAnalysis | null>(null);
  const [windowsPhase, setWindowsPhase] = useState<Phase>("loading");
  const [windowsError, setWindowsError] = useState<string | null>(null);

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
        throw new Error(body.error ?? `The analysis API returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as AnalysisResult;
      setResult(data);
      setMessage(data.ai.recommendation.customerMessage);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
        throw new Error(body.error ?? `The window API returned HTTP ${res.status}`);
      }
      const body = (await res.json()) as { windows: WindowAnalysis | null };
      setWindows(body.windows);
      setWindowsPhase("ready");
    } catch (err) {
      setWindowsError(err instanceof Error ? err.message : "Something went wrong");
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
      setSubmitError("Please enter a reason before rejecting.");
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
      if (!res.ok || !body.entry) {
        throw new Error(body.error ?? `The audit API returned HTTP ${res.status}`);
      }
      setRecorded(body.entry);
      setReason("");
      if (decision === "approved") setApproved(true);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not record the decision");
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
        throw new Error(body.error ?? `The delivery API returned HTTP ${res.status}`);
      }
      setDelivery({ result: body.result, entry: body.entry });
      router.refresh();
    } catch (err) {
      setDeliveryError(err instanceof Error ? err.message : "Could not deliver the message");
    } finally {
      setSending(false);
    }
  }

  if (phase === "loading") {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          Fetching the forecast and generating a recommendation…
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
        </div>
      </section>
    );
  }

  if (phase === "error" || !result) {
    return (
      <section className="rounded-lg border border-rose-200 bg-rose-50 p-6">
        <h2 className="font-semibold text-rose-900">The analysis failed</h2>
        <p className="mt-1 text-sm text-rose-800">{error}</p>
        <button
          type="button"
          onClick={() => void runAnalysis()}
          className="mt-4 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
        >
          Try again
        </button>
      </section>
    );
  }

  const { weather, deterministic, ai } = result;
  const wind = Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh);
  const whatsappProvider = result.delivery.providers.find((p) => p.channel === "whatsapp");
  const canSendViaProvider =
    Boolean(whatsappProvider?.configured) && channel === "whatsapp";

  // The destination comes from the server so a DEMO_WHATSAPP_TO override is
  // honoured. The real number never lives in the repository.
  const targets = result.delivery.targets;
  const handoffLink =
    channel === "whatsapp"
      ? buildWhatsAppLink(targets.whatsapp, message)
      : buildMailtoLink(
          targets.email,
          buildEmailSubject(booking.plan, booking.date),
          message,
        );

  return (
    <div className="space-y-5">
      {result.agreement === "needs_check" && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
          <p className="font-bold text-amber-900">
            NEEDS CHECK — the AI ({ai.recommendation.riskLevel.toUpperCase()}) and the rules (
            {deterministic.riskLevel.toUpperCase()}) do not agree
          </p>
          <p className="mt-1 text-sm text-amber-900">
            Do not act on this automatically. Treat it as the safer of the two (
            {result.effectiveRiskLevel.toUpperCase()}) until a staff member has reviewed it.
          </p>
        </div>
      )}

      {/* --- Weather summary ------------------------------------------- */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">Weather summary</h2>
          <SourceBadge
            label={weather.source === "open-meteo" ? "source: Open-Meteo" : "source: fixture"}
            degraded={weather.degraded}
          />
        </div>

        {weather.degraded && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Running on fallback data: {weather.fallbackReason}
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Conditions</dt>
            <dd className="mt-0.5 font-semibold">{weather.conditionLabel}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Chance of rain</dt>
            <dd className="mt-0.5 font-semibold">{weather.precipitationProbabilityMax}%</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Max wind</dt>
            <dd className="mt-0.5 font-semibold">{wind} km/h</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Temperature</dt>
            <dd className="mt-0.5 font-semibold">{weather.temperatureC}&deg;C</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Precipitation</dt>
            <dd className="mt-0.5 font-semibold">{weather.precipitationMm} mm</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">Warnings</dt>
            <dd className="mt-0.5 font-semibold">
              {weather.alerts.length > 0 ? weather.alerts.join(" / ") : "None"}
            </dd>
          </div>
        </dl>
      </section>

      {/* --- Deterministic vs AI --------------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border-2 border-slate-300 bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">Deterministic rule result</h2>
            <RiskBadge level={deterministic.riskLevel} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Threshold-based. Always shown, regardless of what the AI says.
          </p>

          <ul className="mt-4 space-y-2 text-sm">
            {deterministic.hits.length === 0 ? (
              <li className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
                {deterministic.reason}
              </li>
            ) : (
              deterministic.hits.map((hit) => (
                <li
                  key={hit.id}
                  className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <RiskBadge level={hit.level} size="sm" />
                  <span>
                    <span className="font-semibold">{hit.label}</span>
                    <span className="block text-xs text-slate-600">{hit.detail}</span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">AI assessment</h2>
            <RiskBadge level={ai.recommendation.riskLevel} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SourceBadge
              label={
                ai.source === "live"
                  ? `ai: ${ai.provider ?? "live"} (${ai.model ?? "model"})`
                  : "ai: mock"
              }
              degraded={ai.source === "mock"}
            />
            <SourceBadge label={`confidence: ${ai.recommendation.confidence.toFixed(2)}`} />
            <AgreementBadge agreement={result.agreement} />
          </div>

          {ai.fallbackReason && (
            <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {ai.fallbackReason}
            </p>
          )}

          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Recommended action</dt>
              <dd className="mt-0.5 font-semibold">
                {RECOMMENDATION_LABEL[ai.recommendation.recommendation]}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Reasoning</dt>
              <dd className="mt-0.5 leading-relaxed">{ai.recommendation.summary}</dd>
            </div>
          </dl>

          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            requiresHumanReview: {String(ai.recommendation.requiresHumanReview)} — the AI only
            proposes; it never changes a booking.
          </p>
        </section>
      </div>

      {/* --- Staff decision -------------------------------------------- */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold">Staff decision</h2>
        <p className="mt-1 text-xs text-slate-500">
          None of these buttons calls a booking system, a payment provider or a messaging service.
          They append one line to a local audit log.
        </p>

        <label className="mt-4 block">
          <span className="text-sm font-semibold">
            Reason / note <span className="text-slate-500">(required when rejecting)</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. The indoor studio is free that morning, so I would rather offer a location change than a new date."
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-3">
          {DECISION_BUTTONS.map(({ decision, className, hint }) => (
            <button
              key={decision}
              type="button"
              title={hint}
              disabled={submitting !== null}
              onClick={() => void submitDecision(decision)}
              className={`rounded-md px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 ${className}`}
            >
              {submitting === decision ? "Recording…" : DECISION_LABEL[decision]}
            </button>
          ))}
        </div>

        {submitError && (
          <p className="mt-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {submitError}
          </p>
        )}

        {recorded && (
          <div className="mt-4 rounded border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
            <p className="font-semibold">
              Recorded in the audit log ({DECISION_LABEL[recorded.decision]})
            </p>
            <p className="mt-1 text-xs">{recorded.note}</p>
            <p className="mt-1 font-mono text-[11px] text-emerald-800">
              id: {recorded.id} / bookingSystemMutated: {String(recorded.bookingSystemMutated)}
            </p>
          </div>
        )}
      </section>

      {/* --- Alternative windows (Daytona sandbox) ---------------------- */}
      {windowsPhase === "loading" && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            Asking the model to write a ranking function and running it in a sandbox…
          </div>
        </section>
      )}

      {windowsPhase === "error" && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">
            The alternative-window analysis failed
          </p>
          <p className="mt-1 text-xs text-amber-900">{windowsError}</p>
          <button
            type="button"
            onClick={() => void runWindowAnalysis()}
            className="mt-3 rounded border border-amber-400 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Try again
          </button>
        </section>
      )}

      {windowsPhase === "ready" && windows && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">Better slot on the same day?</h2>
            <SourceBadge
              label={
                windows.source === "daytona-sandbox"
                  ? "computed in a Daytona sandbox"
                  : "computed locally (trusted code)"
              }
              degraded={windows.source === "local-trusted"}
            />
            {windows.executionMs !== undefined && (
              <SourceBadge label={`sandbox: ${windows.executionMs} ms`} />
            )}
          </div>

          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            The model writes a Python ranking function and it runs inside an isolated Daytona
            sandbox — never on this server. If no sandbox is available we fall back to our own
            hand-written implementation; generated code is never executed outside a sandbox.
            Every figure below is recomputed here from the real forecast, so the sandbox cannot
            invent a favourable answer.
          </p>

          {windows.fallbackReason && (
            <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {windows.fallbackReason}
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Currently booked</p>
              {windows.current ? (
                <>
                  <p className="mt-1 text-lg font-bold">
                    {windows.current.start}&ndash;{windows.current.end}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                    <RiskBadge level={windows.current.riskLevel} size="sm" />
                    <span>{windows.current.precipitationProbabilityMax}% rain</span>
                    <span>{windows.current.windSpeedMaxKmh} km/h</span>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-500">Not in the forecast range</p>
              )}
            </div>

            <div
              className={`rounded border p-3 ${
                windows.best
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <p className="text-xs text-slate-500">Best alternative</p>
              {windows.best ? (
                <>
                  <p className="mt-1 text-lg font-bold text-emerald-900">
                    {windows.best.start}&ndash;{windows.best.end}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-emerald-900">
                    <RiskBadge level={windows.best.riskLevel} size="sm" />
                    <span>{windows.best.precipitationProbabilityMax}% rain</span>
                    <span>{windows.best.windSpeedMaxKmh} km/h</span>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-600">
                  Nothing meaningfully better on this day.
                </p>
              )}
            </div>
          </div>

          {windows.alternatives.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="text-slate-500">Ranked:</span>
              {windows.alternatives.map((w) => (
                <span
                  key={w.start}
                  className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-700 ring-1 ring-slate-300"
                >
                  {w.start}&ndash;{w.end} · {w.precipitationProbabilityMax}%
                </span>
              ))}
            </div>
          )}

          {windows.generatedCode && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showCode ? "Hide" : "Show"} the Python the model wrote
              </button>
              {showCode && (
                <pre className="mt-2 max-h-72 overflow-auto rounded border border-slate-200 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
                  {windows.generatedCode}
                </pre>
              )}
            </div>
          )}
        </section>
      )}

      {/* --- Customer message + delivery -------------------------------- */}
      <section
        className={`rounded-lg border bg-white p-5 ${
          approved ? "border-slate-200" : "border-dashed border-slate-300"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">Message to the customer</h2>
          {approved ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-300">
              Unlocked by an approved decision
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-300">
              Locked — approve first
            </span>
          )}
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
            className="ml-auto rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <p className="mt-1 text-xs text-slate-500">
          This is a draft. Edit it freely — what you send is what is in this box.
        </p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={10}
          className="mt-3 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm leading-relaxed focus:border-slate-500 focus:bg-white focus:outline-none"
        />

        {!approved ? (
          <p className="mt-3 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Delivery is disabled until this booking has an <strong>approved</strong> decision. The
            server enforces this too — <code className="font-mono text-xs">/api/deliver</code>{" "}
            returns 409 without an approval on record.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {targets.overridden && (
              <p className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
                DEMO OVERRIDE ACTIVE — messages go to the address configured in
                DEMO_WHATSAPP_TO / DEMO_EMAIL_TO, not to the booking&apos;s fixture contact.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold">Channel</span>
              {(["whatsapp", "email"] as DeliveryChannel[]).map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm">
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
                  {CHANNEL_LABEL[c]}
                  <span className="font-mono text-xs text-slate-500">
                    {c === "whatsapp" ? targets.whatsapp : targets.email}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={handoffLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-slate-800 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-900"
              >
                {channel === "whatsapp" ? "Open in WhatsApp" : "Open in email client"}
              </a>

              <button
                type="button"
                disabled={!canSendViaProvider || sending || message.trim() === ""}
                onClick={() => void sendMessage()}
                title={
                  canSendViaProvider
                    ? "Send through the configured provider"
                    : "No provider is configured for this channel — use the hand-off link"
                }
                className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send via provider"}
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-500">
              <strong>Open in {channel === "whatsapp" ? "WhatsApp" : "email client"}</strong>{" "}
              opens your own client with the draft pre-filled — nothing leaves this server, and you
              press send.{" "}
              <strong>Send via provider</strong>{" "}
              {whatsappProvider?.configured
                ? whatsappProvider.realSendEnabled
                  ? `is LIVE via ${whatsappProvider.provider}. A real message will be delivered.`
                  : `is configured (${whatsappProvider.provider}) but locked: DELIVERY_ALLOW_REAL_SEND is not "true", so the call is simulated.`
                : "is disabled: no WhatsApp provider is configured."}
            </p>

            {deliveryError && (
              <p className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                {deliveryError}
              </p>
            )}

            {delivery && (
              <div
                className={`rounded border px-3 py-3 text-sm ${
                  delivery.result.status === "sent"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : delivery.result.status === "failed"
                      ? "border-rose-300 bg-rose-50 text-rose-900"
                      : "border-slate-300 bg-slate-50 text-slate-700"
                }`}
              >
                <p className="font-semibold">
                  {CHANNEL_LABEL[delivery.result.channel]} · {delivery.result.status} ·{" "}
                  {delivery.result.mode}
                </p>
                {delivery.result.errorReason && (
                  <p className="mt-1 text-xs">{delivery.result.errorReason}</p>
                )}
                <p className="mt-1 font-mono text-[11px]">
                  to: {delivery.result.destinationMasked} / audit id: {delivery.entry.id} /
                  bookingSystemMutated: {String(delivery.entry.bookingSystemMutated)}
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
