"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnalysisResult, AuditEntry, Booking, StaffDecision } from "@/lib/types";
import {
  AgreementBadge,
  DECISION_LABEL,
  RECOMMENDATION_LABEL,
  RiskBadge,
  SourceBadge,
} from "@/components/badges";

/**
 * Client panel: runs the analysis via /api/analyze and records the staff
 * decision via /api/decisions.
 *
 * No secret ever reaches this component — it only talks to same-origin routes.
 */

type Phase = "loading" | "ready" | "error";

const DECISION_BUTTONS: {
  decision: StaffDecision;
  className: string;
  hint: string;
}[] = [
  {
    decision: "approved",
    className: "bg-emerald-600 hover:bg-emerald-700 focus-visible:outline-emerald-600",
    hint: "対応案に同意。監査ログに記録します（予約は変更されません）",
  },
  {
    decision: "rejected",
    className: "bg-rose-600 hover:bg-rose-700 focus-visible:outline-rose-600",
    hint: "対応案を却下。理由の入力が必須です",
  },
  {
    decision: "needs_discussion",
    className: "bg-sky-600 hover:bg-sky-700 focus-visible:outline-sky-600",
    hint: "要確認として記録。チーム内で相談します",
  },
];

export default function AnalysisPanel({ booking }: { booking: Booking }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<StaffDecision | null>(null);
  const [recorded, setRecorded] = useState<AuditEntry | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
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
        throw new Error(body.error ?? `解析APIが HTTP ${res.status} を返しました`);
      }
      setResult((await res.json()) as AnalysisResult);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラーが発生しました");
      setPhase("error");
    }
  }, [booking.bookingId]);

  useEffect(() => {
    void runAnalysis();
  }, [runAnalysis]);

  async function submitDecision(decision: StaffDecision) {
    if (!result) return;
    if (decision === "rejected" && reason.trim() === "") {
      setSubmitError("Reject の場合は理由を入力してください。");
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
        entry?: AuditEntry;
        error?: string;
      };
      if (!res.ok || !body.entry) {
        throw new Error(body.error ?? `記録APIが HTTP ${res.status} を返しました`);
      }
      setRecorded(body.entry);
      setReason("");
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "記録に失敗しました");
    } finally {
      setSubmitting(null);
    }
  }

  if (phase === "loading") {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          天気予報を取得し、リスクと対応案を生成しています…
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
        <h2 className="font-semibold text-rose-900">解析に失敗しました</h2>
        <p className="mt-1 text-sm text-rose-800">{error}</p>
        <button
          type="button"
          onClick={() => void runAnalysis()}
          className="mt-4 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
        >
          再試行
        </button>
      </section>
    );
  }

  const { weather, deterministic, ai } = result;
  const wind = Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh);

  return (
    <div className="space-y-5">
      {result.agreement === "needs_check" && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
          <p className="font-bold text-amber-900">
            要確認 — AI判定（{ai.recommendation.riskLevel.toUpperCase()}）と 決定ルール判定（
            {deterministic.riskLevel.toUpperCase()}）が一致していません
          </p>
          <p className="mt-1 text-sm text-amber-900">
            自動で判断せず、スタッフが内容を確認してください。運用上は安全側（
            {result.effectiveRiskLevel.toUpperCase()}）で扱ってください。
          </p>
        </div>
      )}

      {/* --- Weather summary ------------------------------------------- */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">天気サマリー</h2>
          <SourceBadge
            label={weather.source === "open-meteo" ? "source: Open-Meteo" : "source: fixture"}
            degraded={weather.degraded}
          />
          <span className="ml-auto text-xs text-slate-400">
            取得: {new Date(weather.fetchedAt).toLocaleString("ja-JP")}
          </span>
        </div>

        {weather.degraded && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            フォールバック動作中: {weather.fallbackReason}
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">天候</dt>
            <dd className="mt-0.5 font-semibold">{weather.conditionLabel}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">降水確率(最大)</dt>
            <dd className="mt-0.5 font-semibold">{weather.precipitationProbabilityMax}%</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">最大風速</dt>
            <dd className="mt-0.5 font-semibold">{wind} km/h</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">気温</dt>
            <dd className="mt-0.5 font-semibold">{weather.temperatureC}℃</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">降水量</dt>
            <dd className="mt-0.5 font-semibold">{weather.precipitationMm} mm</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">警報・注意報</dt>
            <dd className="mt-0.5 font-semibold">
              {weather.alerts.length > 0 ? weather.alerts.join(" / ") : "なし"}
            </dd>
          </div>
        </dl>
      </section>

      {/* --- Deterministic vs AI --------------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border-2 border-slate-300 bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">決定ルール判定</h2>
            <RiskBadge level={deterministic.riskLevel} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            しきい値ベース。AIの出力に関係なく常にこの結果を表示します。
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
            <h2 className="text-base font-bold">AI 判定・対応案</h2>
            <RiskBadge level={ai.recommendation.riskLevel} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SourceBadge
              label={ai.source === "live" ? `ai: live (${ai.model ?? "model"})` : "ai: mock"}
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
              <dt className="text-xs text-slate-500">推奨アクション</dt>
              <dd className="mt-0.5 font-semibold">
                {RECOMMENDATION_LABEL[ai.recommendation.recommendation]}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">理由</dt>
              <dd className="mt-0.5 leading-relaxed">{ai.recommendation.summary}</dd>
            </div>
          </dl>

          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            requiresHumanReview: {String(ai.recommendation.requiresHumanReview)} — AIは提案のみを行い、
            予約の変更は実行しません。
          </p>
        </section>
      </div>

      {/* --- Customer message draft ------------------------------------ */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">顧客向けメッセージ案（下書き・未送信）</h2>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            送信機能なし
          </span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(ai.recommendation.customerMessage)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
                .catch(() => setCopied(false));
            }}
            className="ml-auto rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {copied ? "コピーしました" : "コピー"}
          </button>
        </div>
        <pre className="mt-3 whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed">
          {ai.recommendation.customerMessage}
        </pre>
      </section>

      {/* --- Staff decision -------------------------------------------- */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold">スタッフ判断</h2>
        <p className="mt-1 text-xs text-slate-500">
          どのボタンを押しても、予約システム・決済・メール送信は一切呼び出されません。ローカルの監査ログに記録されるだけです。
        </p>

        <label className="mt-4 block">
          <span className="text-sm font-semibold">
            理由 / メモ <span className="text-slate-500">（Reject の場合は必須）</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="例: 屋内スタジオの空きがあるため、振替ではなくロケーション変更を提案したい"
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
              {submitting === decision ? "記録中…" : DECISION_LABEL[decision]}
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
              監査ログに記録しました（{DECISION_LABEL[recorded.decision]}）
            </p>
            <p className="mt-1 text-xs">{recorded.note}</p>
            <p className="mt-1 font-mono text-[11px] text-emerald-800">
              id: {recorded.id} / bookingSystemMutated: {String(recorded.bookingSystemMutated)}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
