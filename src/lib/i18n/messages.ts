/**
 * UI strings, English and Japanese.
 *
 * Client-safe: plain data, no server imports, no secrets. The locale itself is
 * resolved server-side in i18n/server.ts (cookie) and passed down as a prop.
 *
 * Scope note: this dictionary covers the OPERATOR UI only. Customer-facing
 * message drafts are always generated in English regardless of UI language —
 * the customers are international, the staff may not be.
 */

export type Locale = "en" | "ja";
export const LOCALES: Locale[] = ["en", "ja"];
export const LOCALE_COOKIE = "lang";

const en = {
  nav: {
    bookings: "Bookings",
    audit: "Audit log",
    prototypeNote: "prototype · mock data · read-only",
  },
  footer:
    "Hackathon prototype. No real customer data; bookings are never changed, cancelled or refunded. Decisions are recorded to a local audit log and nothing is sent without staff approval.",
  list: {
    title: "Weather triage",
    subtitle: (flagged: number, total: number) =>
      `${flagged} of ${total} upcoming bookings need a weather decision.`,
    needsAction: "Needs action",
    watch: "Watch",
    allClear: "No action needed",
    allClearHint: "Rules found nothing — expand to verify.",
    empty: "Nothing needs attention right now.",
    colWhen: "When",
    colBooking: "Booking",
    colRisk: "Risk",
    colRain: "Rain",
    colWind: "Wind",
    minutes: "min",
  },
  detail: {
    back: "Back to triage",
    when: "When",
    timezone: "Time zone",
    duration: "Duration",
    location: "Location",
    coords: "Coordinates",
    customer: "Customer (dummy)",
    historyTitle: "History for this booking",
    historyEmpty: "Nothing recorded yet.",
    seeAudit: "See every entry in the",
    auditLink: "audit log",
    reasonPrefix: "Reason",
  },
  panel: {
    loading: "Fetching the forecast and generating a recommendation…",
    failed: "The analysis failed",
    retry: "Try again",
    weatherTitle: "Weather",
    sourceFixture: "source: fixture",
    sourceLive: "source: Open-Meteo",
    fallbackPrefix: "Running on fallback data:",
    conditions: "Conditions",
    rain: "Chance of rain",
    wind: "Max wind",
    temp: "Temperature",
    precip: "Precipitation",
    warnings: "Warnings",
    none: "None",
    rulesTitle: "Rule result",
    rulesHint: "Threshold-based. Always shown, regardless of what the AI says.",
    aiTitle: "AI assessment",
    aiMock: "ai: mock",
    confidence: "confidence",
    agree: "Matches the rule result",
    needsCheckBadge: "NEEDS CHECK — AI and rules disagree",
    needsCheckTitle: (ai: string, rule: string) =>
      `NEEDS CHECK — the AI (${ai}) and the rules (${rule}) do not agree`,
    needsCheckBody: (level: string) =>
      `Do not act on this automatically. Treat it as the safer of the two (${level}) until a staff member has reviewed it.`,
    recommendedAction: "Recommended action",
    reasoning: "Reasoning",
    reviewNote: "The AI only proposes; it never changes a booking.",
    windowsTitle: "Better slot on the same day?",
    windowsLoading: "Asking the model to write a ranking function and running it in a sandbox…",
    windowsFailed: "The alternative-window analysis failed",
    windowsSandbox: "computed in a Daytona sandbox",
    windowsLocal: "computed locally (trusted code)",
    windowsHint:
      "The model writes a Python ranking function that runs in an isolated Daytona sandbox — never on this server. Every figure below is recomputed from the real forecast.",
    currentBooked: "Currently booked",
    bestAlt: "Best alternative",
    noneBetter: "Nothing meaningfully better on this day.",
    notInForecast: "Not in the forecast range",
    ranked: "Ranked",
    showCode: "Show the Python the model wrote",
    hideCode: "Hide the generated Python",
    decisionTitle: "Staff decision",
    decisionHint:
      "None of these buttons calls a booking system, a payment provider or a messaging service. They append one line to a local audit log.",
    reasonLabel: "Reason / note",
    reasonRequired: "(required when rejecting)",
    reasonPlaceholder:
      "e.g. The indoor studio is free that morning, so I would rather offer a location change than a new date.",
    reasonMissing: "Please enter a reason before rejecting.",
    recording: "Recording…",
    recordedTitle: "Recorded in the audit log",
    messageTitle: "Message to the customer",
    messageEnglishNote: "Drafts are written in English — the customer is an international client.",
    locked: "Locked — approve first",
    unlocked: "Unlocked by an approved decision",
    copy: "Copy",
    copied: "Copied",
    draftHint: "This is a draft. Edit it freely — what you send is what is in this box.",
    lockedNote:
      "Delivery is disabled until this booking has an approved decision. The server enforces this too — /api/deliver returns 409 without an approval on record.",
    overrideBanner:
      "DEMO OVERRIDE ACTIVE — messages go to the address configured in DEMO_WHATSAPP_TO / DEMO_EMAIL_TO, not to the booking's fixture contact.",
    channel: "Channel",
    openWhatsApp: "Open in WhatsApp",
    openEmail: "Open in email client",
    sendProvider: "Send via provider",
    sending: "Sending…",
    handoffExplain:
      "The hand-off button opens your own client with the draft pre-filled — nothing leaves this server, and you press send.",
    providerDisabled: "Provider sending is disabled: no WhatsApp provider is configured.",
    providerLocked: (p: string) =>
      `Provider ${p} is configured but locked: DELIVERY_ALLOW_REAL_SEND is not "true", so calls are simulated.`,
    providerLive: (p: string) => `Provider sending is LIVE via ${p}. A real message will be delivered.`,
    deliveredTo: "to",
    auditId: "audit id",
  },
  audit: {
    title: "Audit log",
    subtitle:
      "Every staff decision and every message delivery, appended to a local file. No entry changes a booking. Destinations are masked and message bodies are never stored — only their length.",
    empty: "Nothing recorded yet. Open a booking from the triage list and record a decision.",
    ephemeral:
      "This deployment writes the log to /tmp, which is ephemeral on serverless hosting — entries can disappear on a cold start. A real deployment must use a database.",
    rules: "Rules",
    ai: "AI",
    recommended: "Recommended",
    to: "To",
    mode: "Mode",
    msgLen: "Message length",
    chars: "chars",
    approvedByDecision: "approved by decision",
    reason: "Reason",
    needsCheck: "NEEDS CHECK",
  },
  decision: {
    approved: "Approve",
    rejected: "Reject",
    needs_discussion: "Needs discussion",
  },
  recommendation: {
    keep: "Go ahead as planned",
    reschedule: "Offer another date",
    plan_change: "Offer a plan or location change",
    contact_staff: "Needs a staff decision",
  },
  deliveryStatus: {
    sent: "Sent",
    prepared: "Prepared (not sent)",
    failed: "Failed",
  },
  channel: {
    whatsapp: "WhatsApp",
    email: "Email",
  },
};

export type Messages = typeof en;

const ja: Messages = {
  nav: {
    bookings: "予約",
    audit: "監査ログ",
    prototypeNote: "プロトタイプ · モックデータ · 読み取り専用",
  },
  footer:
    "ハッカソン用プロトタイプです。実顧客データは含まれず、予約の変更・キャンセル・返金は行いません。判断はローカル監査ログに記録され、スタッフの承認なしに送信されるものはありません。",
  list: {
    title: "天候トリアージ",
    subtitle: (flagged, total) => `直近の予約 ${total} 件のうち ${flagged} 件が天候対応を要します。`,
    needsAction: "要対応",
    watch: "経過観察",
    allClear: "対応不要",
    allClearHint: "ルール判定では問題なし — 展開して確認できます。",
    empty: "現在、対応が必要な予約はありません。",
    colWhen: "日時",
    colBooking: "予約",
    colRisk: "リスク",
    colRain: "降水",
    colWind: "風速",
    minutes: "分",
  },
  detail: {
    back: "トリアージへ戻る",
    when: "日時",
    timezone: "タイムゾーン",
    duration: "所要時間",
    location: "ロケーション",
    coords: "座標",
    customer: "顧客（ダミー）",
    historyTitle: "この予約の履歴",
    historyEmpty: "まだ記録がありません。",
    seeAudit: "全件は",
    auditLink: "監査ログ",
    reasonPrefix: "理由",
  },
  panel: {
    loading: "予報を取得し、対応案を生成しています…",
    failed: "解析に失敗しました",
    retry: "再試行",
    weatherTitle: "天気",
    sourceFixture: "source: fixture",
    sourceLive: "source: Open-Meteo",
    fallbackPrefix: "フォールバック動作中:",
    conditions: "天候",
    rain: "降水確率",
    wind: "最大風速",
    temp: "気温",
    precip: "降水量",
    warnings: "警報・注意報",
    none: "なし",
    rulesTitle: "ルール判定",
    rulesHint: "しきい値ベース。AIの出力に関係なく常に表示します。",
    aiTitle: "AI判定",
    aiMock: "ai: mock",
    confidence: "確信度",
    agree: "ルール判定と一致",
    needsCheckBadge: "要確認 — AI判定とルール判定が不一致",
    needsCheckTitle: (ai, rule) => `要確認 — AI判定（${ai}）とルール判定（${rule}）が一致していません`,
    needsCheckBody: (level) =>
      `自動で判断せず、スタッフが確認するまで安全側（${level}）として扱ってください。`,
    recommendedAction: "推奨アクション",
    reasoning: "判断理由",
    reviewNote: "AIは提案のみを行い、予約を変更することはありません。",
    windowsTitle: "同日により良い時間帯は？",
    windowsLoading: "モデルにランキング関数を書かせ、サンドボックスで実行しています…",
    windowsFailed: "代替時間帯の解析に失敗しました",
    windowsSandbox: "Daytonaサンドボックスで計算",
    windowsLocal: "ローカルで計算（信頼済みコード）",
    windowsHint:
      "モデルが書いたPythonのランキング関数を、このサーバーではなく隔離されたDaytonaサンドボックスで実行します。表示される数値はすべて実際の予報から再計算されています。",
    currentBooked: "現在の予約枠",
    bestAlt: "最良の代替枠",
    noneBetter: "この日に有意に良い時間帯はありません。",
    notInForecast: "予報範囲外",
    ranked: "候補",
    showCode: "モデルが書いたPythonを表示",
    hideCode: "生成コードを隠す",
    decisionTitle: "スタッフ判断",
    decisionHint:
      "どのボタンも予約システム・決済・メッセージ送信サービスを呼び出しません。ローカル監査ログに1行追記されるだけです。",
    reasonLabel: "理由 / メモ",
    reasonRequired: "（Reject の場合は必須）",
    reasonPlaceholder: "例: 午前は屋内スタジオが空いているので、振替ではなくロケーション変更を提案したい。",
    reasonMissing: "Reject する前に理由を入力してください。",
    recording: "記録中…",
    recordedTitle: "監査ログに記録しました",
    messageTitle: "顧客向けメッセージ",
    messageEnglishNote: "下書きは英語で生成されます（顧客は海外のお客様です）。",
    locked: "ロック中 — 先に Approve してください",
    unlocked: "承認済み — 送信可能",
    copy: "コピー",
    copied: "コピーしました",
    draftHint: "これは下書きです。自由に編集できます — 送られるのはこのボックスの内容です。",
    lockedNote:
      "この予約に承認済みの判断が記録されるまで送信は無効です。サーバー側でも強制されます（承認なしの /api/deliver は 409 を返します）。",
    overrideBanner:
      "デモ用上書きが有効 — メッセージは予約のダミー連絡先ではなく DEMO_WHATSAPP_TO / DEMO_EMAIL_TO 宛になります。",
    channel: "送信先",
    openWhatsApp: "WhatsAppで開く",
    openEmail: "メールクライアントで開く",
    sendProvider: "プロバイダ経由で送信",
    sending: "送信中…",
    handoffExplain:
      "ハンドオフボタンは、下書きが入力された状態であなた自身のクライアントを開きます。このサーバーからは何も送信されず、送信ボタンを押すのはあなたです。",
    providerDisabled: "プロバイダ送信は無効です: WhatsAppプロバイダが未設定です。",
    providerLocked: (p) =>
      `プロバイダ ${p} は設定済みですがロック中です: DELIVERY_ALLOW_REAL_SEND が "true" でないため、呼び出しはシミュレートされます。`,
    providerLive: (p) => `プロバイダ送信は有効です（${p}）。実際にメッセージが届きます。`,
    deliveredTo: "宛先",
    auditId: "監査ID",
  },
  audit: {
    title: "監査ログ",
    subtitle:
      "スタッフの全判断と全送信記録をローカルファイルに追記したものです。予約を変更する記録は存在しません。宛先はマスクされ、本文は保存されません（文字数のみ）。",
    empty: "まだ記録がありません。トリアージから予約を開いて判断を記録してください。",
    ephemeral:
      "このデプロイはログを /tmp に書き込みます。サーバーレスでは揮発するため、コールドスタートで消えることがあります。本番運用ではデータベースが必要です。",
    rules: "ルール",
    ai: "AI",
    recommended: "推奨",
    to: "宛先",
    mode: "モード",
    msgLen: "本文長",
    chars: "文字",
    approvedByDecision: "承認元の判断",
    reason: "理由",
    needsCheck: "要確認",
  },
  decision: {
    approved: "Approve",
    rejected: "Reject",
    needs_discussion: "Needs discussion",
  },
  recommendation: {
    keep: "予定どおり実施",
    reschedule: "別日への振替を提案",
    plan_change: "プラン・ロケーション変更を提案",
    contact_staff: "スタッフの判断が必要",
  },
  deliveryStatus: {
    sent: "送信済み",
    prepared: "準備のみ（未送信）",
    failed: "失敗",
  },
  channel: {
    whatsapp: "WhatsApp",
    email: "メール",
  },
};

export const messages: Record<Locale, Messages> = { en, ja };

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ja";
}
