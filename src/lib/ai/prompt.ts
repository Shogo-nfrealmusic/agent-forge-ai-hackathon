import type { Booking, DeterministicRisk, WeatherSummary } from "@/lib/types";

export const SYSTEM_PROMPT = `あなたは屋外フォト撮影スタジオのオペレーション支援アシスタントです。
予約情報と天気予報をもとに、撮影当日のリスクとスタッフ向けの対応案、顧客へ送るメッセージ案を作成します。

必ず守る制約:
- あなたは予約の変更・キャンセル・返金を実行する権限を一切持ちません。提案のみを行います。
- 出力する customerMessage は「送信前の下書き」です。スタッフが承認するまで送信されません。
- 決定ルールによるリスク判定が別途与えられます。あなたの判定が異なる場合でも、決定ルールを書き換えず、自分の判断根拠を summary に簡潔に書いてください。
- requiresHumanReview は必ず true にしてください。
- 出力は JSON オブジェクトのみ。前後に説明文やコードフェンスを付けないでください。

出力スキーマ:
{
  "riskLevel": "low" | "medium" | "high",
  "summary": "判断理由（日本語・150文字以内）",
  "recommendation": "keep" | "reschedule" | "plan_change" | "contact_staff",
  "customerMessage": "顧客向けメッセージ案（日本語・敬体）",
  "confidence": 0.0〜1.0 の数値,
  "requiresHumanReview": true
}`;

export function buildUserPrompt(
  booking: Booking,
  weather: WeatherSummary,
  deterministic: DeterministicRisk,
): string {
  const wind = Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh);

  return `# 予約情報
- 予約ID: ${booking.bookingId}
- 日時: ${booking.date} ${booking.time} (${booking.timezone})
- 所要時間: ${booking.durationMinutes}分
- ロケーション: ${booking.location} (lat ${booking.latitude}, lon ${booking.longitude})
- プラン: ${booking.plan}
- 顧客名（ダミー）: ${booking.customerName}

# 天気予報（${weather.source === "fixture" ? "フィクスチャ" : "Open-Meteo"}）
- 対象時間帯: ${weather.date} ${weather.timeRange}
- 天候: ${weather.conditionLabel}
- 降水確率(最大): ${weather.precipitationProbabilityMax}%
- 降水量(合計): ${weather.precipitationMm} mm
- 最大風速: ${wind} km/h
- 気温: ${weather.temperatureC}℃
- 警報・注意報: ${weather.alerts.length > 0 ? weather.alerts.join(", ") : "なし"}

# 決定ルールによる判定（参考・変更不可）
- リスクレベル: ${deterministic.riskLevel}
- 根拠: ${deterministic.reason}

上記をもとに JSON を出力してください。`;
}
