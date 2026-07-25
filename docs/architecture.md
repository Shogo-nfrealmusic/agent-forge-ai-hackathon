# Architecture

## 全体像

```
┌──────────────────────────── Browser (client) ────────────────────────────┐
│  /                予約一覧 (Server Component)                             │
│  /bookings/[id]   予約詳細 (Server) + AnalysisPanel (Client)              │
│  /audit           監査ログ (Server Component)                             │
│                                                                          │
│  クライアントは同一オリジンの API しか叩かない。secret には一切触れない。    │
└───────────────┬──────────────────────────────────┬───────────────────────┘
                │ POST /api/analyze                │ POST /api/decisions
                ▼                                  ▼
┌──────────────────────────── Next.js server ──────────────────────────────┐
│                                                                          │
│  analyzeBooking()                          recordDecision()              │
│    ├─ 1. weather adapter ────────────────┐   └─ append 1 line to         │
│    │      Open-Meteo (no key)            │      .data/audit-log.jsonl    │
│    │      失敗 → fixture weather          │      （ネットワーク I/O なし） │
│    ├─ 2. deterministic rules ────────────┤                               │
│    │      しきい値のみ。AI に依存しない     │                               │
│    └─ 3. AI adapter ─────────────────────┘                               │
│           OpenAI 互換 /chat/completions                                   │
│           AI_API_KEY はここでのみ読む                                      │
│           失敗 / 不正 JSON → mock adapter                                 │
│                                                                          │
│  出力: { weather, deterministic, ai, agreement, effectiveRiskLevel }      │
└──────────────────────────────────────────────────────────────────────────┘

書き込み先は .data/audit-log.jsonl のみ。予約システムへの接続は存在しない。
```

## 設計上の中心的な判断

### 1. 決定ルールが真実、AI は第二意見

リスク判定は 2 系統で独立に走ります。

- **決定ルール** (`src/lib/risk/rules.ts`) — しきい値だけの純関数。テスト可能で、説明可能で、揺れない。
- **AI** (`src/lib/ai/adapter.ts`) — 文脈を汲んだ対応案と顧客向け文面を作る。

AI にはルール判定の結果をプロンプトで渡しますが、**AI がルールの結果を書き換えることはできません**
（ルールは AI 呼び出しの前に確定し、レスポンスとは別フィールドで返ります）。

両者が食い違った場合は `agreement: "needs_check"` となり、UI に「要確認」を大きく表示します。
さらに `effectiveRiskLevel` として**安全側（高い方）**のレベルを併記します。

これは「AI が Low と言ったから撮影を強行した」という失敗モードを構造的に防ぐためです。

### 2. すべての外部依存にフォールバックがある

| アダプタ | 一次系 | 二次系 | 判別方法 |
|---|---|---|---|
| weather | Open-Meteo | fixture weather | `weather.source` / `weather.degraded` |
| ai | OpenAI 互換 API | mock adapter | `ai.source` / `ai.fallbackReason` |

どちらも例外を投げません。呼び出し側は必ず使える値を受け取ります。
デモ中に Wi-Fi が落ちても画面は成立します（`WEATHER_USE_LIVE=false` で完全オフライン）。

### 3. mock AI はルールのコピーではない

mock adapter (`src/lib/ai/mock.ts`) はわざと**しきい値を変えて**あります（medium が 60% 以上、ルールは 70% 以上）。

理由は 2 つ:

- ルールのコピーだと「AI とルールが常に一致」してしまい、要確認フローがデモできない
- 実運用でも AI とルールは食い違うのが普通で、その状態を既定でテストしておきたい

`demo-booking-002`（降水確率 65%）がこの不一致ケースになります。

### 4. 監査ログは追記専用の JSONL

`.data/audit-log.jsonl` に 1 行 1 レコードで追記します。更新も削除もしません。
各レコードには判断時点のルール判定・AI 判定・データソースが含まれ、
`bookingSystemMutated: false` が常に刻まれます。

破損行があってもその行をスキップするだけで、監査画面は壊れません。

## データフロー詳細

### POST /api/analyze

```
{ bookingId } → findBooking() → 404 if unknown
              → getWeatherForBooking()   (Open-Meteo or fixture)
              → evaluateDeterministicRisk()
              → getAiRecommendation()    (live or mock, zod 検証)
              → { booking, weather, deterministic, ai, agreement, effectiveRiskLevel }
```

### POST /api/decisions

```
{ bookingId, decision, reason, ...snapshot }
  → zod 検証（rejected なら reason 必須）
  → recordDecision() → .data/audit-log.jsonl に 1 行 append
  → 201 { entry, bookingSystemMutated: false }
```

このパスにネットワーク I/O は一切ありません（`tests/no-external-calls.test.ts` で静的・動的の両方から検証）。

## 天気データについて

Open-Meteo (`https://api.open-meteo.com/v1/forecast`) を API キーなしで使用します。

取得項目: `precipitation_probability`, `precipitation`, `wind_speed_10m`, `wind_gusts_10m`,
`temperature_2m`, `weather_code`（`wind_speed_unit=kmh`, `timezone` は予約のものを指定）。

予約時間帯に重なる時刻のみを集計します（例: `10:00-11:30` → 10 時台と 11 時台）。

**制約**: Open-Meteo は公式の気象警報を配信していません。本プロトタイプでは
`WeatherSummary.alerts` を fixture 側で持たせています。実運用では気象庁の警報・注意報 API
（あるいは同等の商用フィード）をアダプタとして追加する必要があります。

## 実予約システム接続時のアダプタ仕様

現状は「読み取りすら行わない」完全独立プロトタイプです。実システムに繋ぐ場合、
以下 4 つのアダプタを **この順序で、段階的に** 導入することを想定しています。

### Phase 1: BookingReader（読み取り専用）

```ts
interface BookingReader {
  /** 指定期間の屋外撮影予約を取得する。読み取り専用スコープのみを要求する。 */
  listUpcoming(range: { from: string; to: string }): Promise<Booking[]>;
  get(bookingId: string): Promise<Booking | null>;
}
```

要件:

- 認証は read-only スコープの API キー／サービスアカウントに限定する
- 顧客の氏名・メールは**このプロセス内でのみ**使い、ログ・LLM プロンプト・監査ログには残さない
  （現状の実装は `customerName` をプロンプトに含めているため、実データ接続時はここを疑似 ID に置換する）
- レートリミットとキャッシュ（同一予約の再解析は 15 分程度キャッシュ）

### Phase 2: NotificationDrafter（下書き作成まで。送信しない）

```ts
interface NotificationDrafter {
  /** 顧客向けメッセージを「下書き」として保存する。送信はしない。 */
  createDraft(input: {
    bookingId: string;
    subject: string;
    body: string;
    createdBy: "weather-agent";
  }): Promise<{ draftId: string; reviewUrl: string }>;
}
```

要件:

- 送信 API（Resend / SendGrid 等）の **send スコープを持たせない**
- 下書きは必ずスタッフの UI 上で編集・送信できる状態にする
- 承認前に自動送信するオプションを実装しない

### Phase 3: BookingMutator（変更提案。実行は人間）

```ts
interface BookingMutator {
  /** 「変更提案」を作る。予約そのものは変更しない。 */
  proposeChange(input: {
    bookingId: string;
    kind: "reschedule" | "location_change" | "plan_change";
    candidates: { date: string; time: string; location?: string }[];
    rationale: string;
    approvedBy: string;      // スタッフの識別子。必須
    auditEntryId: string;    // 監査ログとの紐付け。必須
  }): Promise<{ proposalId: string }>;

  /** 提案の適用。スタッフの明示操作からのみ呼ばれる。エージェントからは呼ばない。 */
  applyProposal(proposalId: string, actor: { staffId: string }): Promise<void>;
}
```

必須の安全要件:

- `applyProposal` を**エージェントの実行経路から到達不能にする**（別モジュール／別権限）
- `approvedBy` と `auditEntryId` のない変更を API 側で拒否する
- 冪等キー（`proposalId`）で二重適用を防ぐ
- キャンセル・返金は本エージェントのスコープ外とし、アダプタを用意しない

### Phase 4: WeatherAlertFeed（公式警報）

```ts
interface WeatherAlertFeed {
  /** 指定座標・日付に発表中の警報・注意報を返す。 */
  getAlerts(input: { latitude: number; longitude: number; date: string }): Promise<string[]>;
}
```

`evaluateDeterministicRisk` は既に `alerts: string[]` を入力として受け取る設計のため、
このアダプタを差し込むだけでルール側の変更は不要です。

### 共通要件

- すべてのアダプタはサーバー側モジュールに閉じる（`"use client"` から import できないこと）
- 失敗時は必ずフォールバックを持ち、例外を上位に投げない
- 認証情報は環境変数のみ。`NEXT_PUBLIC_` を付けない
- 監査ログに `adapterVersion` と `actor` を追加し、誰の承認で何が起きたかを追跡可能にする
