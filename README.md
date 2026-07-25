# Weather Booking Adjustment Agent

屋外フォト撮影の**予約情報**と**天気予報**から、撮影当日のリスクと対応案・顧客向けメッセージ案を生成し、
**スタッフが承認して初めて次に進む** human-in-the-loop な AI エージェントのプロトタイプです。

> **このアプリは予約を変更・キャンセル・返金しません。**
> 既存の予約サイトや社内システムには一切接続せず、すべて fixture / mock data で動作します。

---

## できること

1. mock 予約一覧の表示
2. 予約日時・座標に対する天気予報の取得（Open-Meteo / 失敗時は fixture）
3. **決定ルール**による Low / Medium / High のリスク判定（AI に依存しない）
4. AI による対応案の生成（OpenAI 互換 API / キー未設定なら mock）
5. 顧客向けメッセージ案（下書き）の生成
6. スタッフによる **Approve / Reject / Needs discussion** の選択
7. 選択結果のローカル監査ログ（JSONL）への記録

**AI 判定と決定ルール判定が異なる場合は「要確認」を大きく表示します。** AI の判断だけでは何も決まりません。

---

## 動かし方

```bash
# 1. 依存インストール
npm install

# 2. 環境変数（任意。設定しなくても mock で完全に動きます）
cp .env.example .env.local

# 3. 起動
npm run dev
# → http://localhost:3000
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド |
| `npm test` | テスト実行（vitest, 115 件） |
| `npm run typecheck` | 型チェック |

デモ手順は [`docs/demo.md`](docs/demo.md) を参照してください。

---

## 環境変数

すべて**サーバー側のみ**で読み込みます。`NEXT_PUBLIC_` を付けてはいけません。

| 変数 | 必須 | 既定値 | 内容 |
|---|---|---|---|
| `AI_API_KEY` | いいえ | （空） | 未設定なら mock adapter で動作 |
| `AI_BASE_URL` | いいえ | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | OpenAI 互換エンドポイント（Qwen Cloud 既定） |
| `AI_MODEL` | いいえ | `qwen-plus` | モデル名 |
| `WEATHER_USE_LIVE` | いいえ | `true` | `false` にすると天気も完全オフライン（fixture） |
| `AUDIT_LOG_PATH` | いいえ | `./.data/audit-log.jsonl` | 監査ログの保存先 |

詳細は [`docs/security.md`](docs/security.md)。

---

## 決定ルール（AI に依存しない判定）

| 条件 | 判定 |
|---|---|
| 警報・注意報（台風等）が発表中 | **High** |
| 雷雨（WMO code 95 / 96 / 99） | **High** |
| 最大風速 30 km/h 以上 | **High** |
| 降水確率 80% 以上 | **High** |
| 降水確率 70% 以上 | **Medium** |
| 上記いずれにも該当しない | **Low** |

複数該当した場合は最も高いレベルを採用します。実装: [`src/lib/risk/rules.ts`](src/lib/risk/rules.ts)

---

## AI レスポンス仕様

AI には必ずこの形の JSON を返させ、**zod で検証**します。検証に失敗した応答は破棄し、mock にフォールバックします。

```json
{
  "riskLevel": "low | medium | high",
  "summary": "短い理由",
  "recommendation": "keep | reschedule | plan_change | contact_staff",
  "customerMessage": "顧客向けメッセージ案",
  "confidence": 0.0,
  "requiresHumanReview": true
}
```

`requiresHumanReview` はモデルが `false` を返してもサーバー側で必ず `true` に上書きします。

---

## フォールバック設計

| 障害 | 挙動 |
|---|---|
| `AI_API_KEY` 未設定 | mock adapter で応答（画面にバッジ表示） |
| AI provider が到達不能 / タイムアウト | mock にフォールバック、理由を画面に表示 |
| AI が非 2xx を返した | mock にフォールバック（レスポンス本文は表示しない） |
| AI が JSON でない / スキーマ不一致 | mock にフォールバック |
| 天気 API が失敗 / 予報範囲外 | fixture weather にフォールバック、`degraded` バッジ表示 |
| 天気 API のレスポンスが壊れている | fixture weather にフォールバック |

**どの障害でも画面は壊れません。**

---

## ディレクトリ構成

```
src/
├── app/
│   ├── page.tsx                  予約一覧
│   ├── bookings/[id]/page.tsx    予約詳細
│   ├── audit/page.tsx            監査ログ
│   └── api/
│       ├── analyze/route.ts      天気取得 + ルール判定 + AI（サーバー専用）
│       └── decisions/route.ts    スタッフ判断の記録（ローカルファイルのみ）
├── components/
│   ├── AnalysisPanel.tsx         クライアント UI（秘密情報に触れない）
│   └── badges.tsx
└── lib/
    ├── analysis.ts               オーケストレーション
    ├── risk/rules.ts             決定ルール
    ├── weather/open-meteo.ts     天気アダプタ + fallback
    ├── ai/{adapter,schema,mock,prompt}.ts   AI アダプタ
    ├── audit/store.ts            監査ログ（JSONL 追記のみ）
    └── fixtures/{bookings,weather}.ts
tests/                            vitest（115 件）
docs/{architecture,security,demo}.md
```

---

## テスト

```bash
npm test
```

カバーしている観点:

- Low / Medium / High の判定（境界値 69/70/79/80、29/30 km/h を含む）
- 雷・強風・警報・高降水確率の判定
- AI API 失敗時（不通 / 非2xx / タイムアウト / 空応答 / 非JSON / スキーマ不一致）の mock フォールバック
- **Approve しても外部 API が呼ばれないこと**（fetch スパイ＋静的検査）
- Reject 理由が監査ログに残ること／理由なし Reject が拒否されること
- 顧客の実データが存在しないこと（メール・氏名・電話番号・郵便番号の全走査）
- secret がブラウザに露出しないこと（`"use client"` からの `process.env` 参照禁止など）
- 不正な AI レスポンスを安全に処理できること

---

## やらないこと（意図的な制約）

- 予約の変更・キャンセル・返金
- 顧客への実際のメッセージ送信
- Stripe / Slack / Google Calendar / Resend など外部サービスへの接続
- 実顧客データの取り扱い
- 認証・ユーザー管理（プロトタイプのため未実装）

実運用の予約システムに接続する場合に必要なアダプタ仕様は
[`docs/architecture.md`](docs/architecture.md) の「実予約システム接続時のアダプタ仕様」を参照してください。

---

## 位置づけ

ハッカソン用プロトタイプ。実運用前提の実装ではありません。
