import type {
  AiRecommendation,
  Booking,
  DeterministicRisk,
  Recommendation,
  RiskLevel,
  WeatherSummary,
} from "@/lib/types";
import { THUNDERSTORM_CODES } from "@/lib/risk/rules";

/**
 * Mock AI adapter.
 *
 * Used when no API key is configured, when the live provider fails, or when the
 * live response fails validation. It is intentionally a *slightly different*
 * heuristic from the deterministic rules (medium at >=60% instead of >=70%) so
 * the demo can exercise the "AI と ルールが不一致 → 要確認" path without a
 * network call.
 */

const MOCK_THRESHOLDS = {
  precipMedium: 60,
  precipHigh: 80,
  windHigh: 30,
} as const;

function mockRiskLevel(weather: WeatherSummary): RiskLevel {
  const hasThunder = weather.weatherCodes.some((c) =>
    (THUNDERSTORM_CODES as readonly number[]).includes(c),
  );
  const wind = Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh);

  if (weather.alerts.length > 0 || hasThunder || wind >= MOCK_THRESHOLDS.windHigh) return "high";
  if (weather.precipitationProbabilityMax >= MOCK_THRESHOLDS.precipHigh) return "high";
  if (weather.precipitationProbabilityMax >= MOCK_THRESHOLDS.precipMedium) return "medium";
  return "low";
}

const RECOMMENDATION_BY_LEVEL: Record<RiskLevel, Recommendation> = {
  low: "keep",
  medium: "plan_change",
  high: "reschedule",
};

const CONFIDENCE_BY_LEVEL: Record<RiskLevel, number> = {
  low: 0.82,
  medium: 0.64,
  high: 0.78,
};

function buildSummary(weather: WeatherSummary, level: RiskLevel): string {
  const parts = [
    `降水確率 ${weather.precipitationProbabilityMax}%`,
    `最大風速 ${Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh)} km/h`,
    weather.conditionLabel,
  ];
  if (weather.alerts.length > 0) parts.push(`警報: ${weather.alerts.join(", ")}`);

  const verdict: Record<RiskLevel, string> = {
    low: "撮影実施に大きな支障はない見込み",
    medium: "撮影は可能だが天候が崩れる可能性があり調整余地あり",
    high: "予定どおりの屋外撮影は困難な見込み",
  };
  return `${parts.join(" / ")}。${verdict[level]}。`;
}

function buildCustomerMessage(
  booking: Booking,
  weather: WeatherSummary,
  level: RiskLevel,
): string {
  const when = `${booking.date} ${booking.time}`;
  const head = `${booking.customerName} 様\n\nいつもご利用ありがとうございます。${when}（${booking.location}）でご予約いただいている「${booking.plan}」について、当日の天候見込みをご連絡いたします。`;
  const weatherLine = `現時点の予報では、降水確率 ${weather.precipitationProbabilityMax}%、${weather.conditionLabel}となっております。`;

  const body: Record<RiskLevel, string> = {
    low: "現時点では予定どおり実施できる見込みです。当日の状況に変化があった場合は、改めてご連絡いたします。",
    medium:
      "天候が崩れる可能性があるため、①開始時間の前後調整、②屋根のあるロケーションへの変更、③別日への振替、のいずれかをご検討いただけますと幸いです。ご希望をお知らせいただければ、こちらで空き状況をお調べいたします。",
    high: "安全面と仕上がりの品質を考慮し、別日への振替、または屋内ロケーションへの変更をご提案させていただきたく存じます。ご都合のよい候補日をお知らせいただけますでしょうか。振替に伴う追加費用はいただきません。",
  };

  return `${head}\n\n${weatherLine}${body[level]}\n\nご不明な点がございましたら、本メールにご返信ください。\n\n（このメッセージは下書きです。担当スタッフの確認後に送信されます）`;
}

export function generateMockRecommendation(
  booking: Booking,
  weather: WeatherSummary,
  deterministic: DeterministicRisk,
): AiRecommendation {
  const level = mockRiskLevel(weather);
  const disagrees = level !== deterministic.riskLevel;

  return {
    riskLevel: level,
    summary:
      buildSummary(weather, level) +
      (disagrees ? "（決定ルールの判定と異なるため、スタッフによる確認が必要です）" : ""),
    recommendation: disagrees ? "contact_staff" : RECOMMENDATION_BY_LEVEL[level],
    customerMessage: buildCustomerMessage(booking, weather, level),
    confidence: disagrees ? 0.5 : CONFIDENCE_BY_LEVEL[level],
    requiresHumanReview: true,
  };
}
