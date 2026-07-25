# Security & Safety

このプロトタイプは「AI が予約を勝手に触らない」ことを最優先に設計しています。
以下はその保証内容と、それをどうテストで固定しているかの一覧です。

---

## 1. 予約システムへの副作用がないこと

### 保証

- 予約の**変更・キャンセル・返金を行うコードが存在しない**
- Approve / Reject / Needs discussion のいずれを押しても、書き込み先は
  ローカルファイル `.data/audit-log.jsonl` **のみ**
- 監査ログの全レコードに `bookingSystemMutated: false` が記録される

### 実装上の担保

- `src/lib/audit/store.ts` と `src/app/api/decisions/route.ts` に `fetch()` が存在しない
- Stripe / Slack / Google Calendar / Resend / Twilio / SendGrid / nodemailer の
  SDK を依存関係に持たない

### テスト（`tests/no-external-calls.test.ts`）

- `fetch` を「呼ばれたら throw する」スパイに差し替えた状態で 3 種の判断を記録し、
  一度も呼ばれないことを確認
- 判断パスのソースに `fetch(` / `XMLHttpRequest` が現れないことを静的検査
- 全ソースの import 文を走査し、禁止 SDK が含まれないことを確認
- `api.stripe.com` / `hooks.slack.com` / `googleapis.com` / `api.resend.com` などの
  文字列がソースに現れないことを確認

---

## 2. Secret がブラウザに露出しないこと

### ルール

- `AI_API_KEY` は **`src/lib/ai/adapter.ts`（サーバー専用モジュール）でのみ**読む
- `NEXT_PUBLIC_` プレフィックスの付いた認証情報を作らない
  （Next.js は `NEXT_PUBLIC_*` をクライアントバンドルにインライン展開する）
- `"use client"` モジュールから `process.env` を参照しない
- AI provider が返したエラーレスポンス本文を UI に出さない
  （プロバイダによってはキーの断片をエコーバックするため）

### 実装上の担保

- `ai/adapter.ts` に `typeof window !== "undefined"` の実行時ガードがあり、
  万一クライアントにバンドルされた場合は即座に throw する
- API キーは `Authorization: Bearer` ヘッダにのみ載せ、URL やリクエストボディには載せない
- `.gitignore` で `.env*` を除外し、`!.env.example` のみ追跡する

### テスト（`tests/no-secret-exposure.test.ts`）

- `"use client"` モジュールが `process.env` を含まないこと
- `"use client"` モジュールが AI アダプタ／監査ストアを import しないこと
- `NEXT_PUBLIC_*` に `API_KEY` / `SECRET` / `TOKEN` / `PASSWORD` を含む変数がないこと
- AI 認証情報を読むファイルが `lib/ai` または `app/api` 配下に限られること
- `sk-` / `sk-ant-` / `AIza` / `ghp_` 形式のリテラルがソースに存在しないこと
- `next.config.ts` が env を再エクスポートしていないこと
- `.env.example` の secret 系変数の値が空であること

### テスト（`tests/ai-adapter.test.ts`）

- API キーが URL にもリクエストボディにも含まれず、`Authorization` ヘッダにのみ載ること
- provider が 401 とキー断片を返しても、フォールバック理由に `sk-` が含まれないこと

---

## 3. 実顧客データが存在しないこと

### ルール

- `customerName` は必ず `Demo` で始まるダミー値
- `customerEmail` は RFC 2606 の予約ドメイン（`example.com` など）のみ
- 電話番号・住所・郵便番号のフィールドを持たない
- `bookingId` は `demo-booking-NNN` 形式

### テスト（`tests/no-real-customer-data.test.ts`）

- 全 fixture の氏名・メールドメイン・ID 形式を検証
- fixture のシリアライズ結果に電話番号・郵便番号パターンが現れないことを確認
- **ソースツリー全体**を走査し、予約ドメイン以外のメールアドレスが 1 件もないことを確認
- ソースツリー全体に電話番号パターンが現れないことを確認

### 実データ接続時の注意

現在の実装は `customerName` を LLM プロンプトに含めています（`src/lib/ai/prompt.ts`）。
実データに接続する際は、ここを疑似 ID（例: `顧客A`）に置換し、
顧客の氏名・メールを外部 LLM に送らない設計へ変更してください。
詳細は [`architecture.md`](architecture.md) の Phase 1 を参照。

---

## 4. AI 出力の信頼境界

AI の出力は**信頼できない入力**として扱います。

| 対策 | 実装 |
|---|---|
| 構造の強制 | `response_format: { type: "json_object" }` + zod による strict 検証 |
| コードフェンス・前後の散文への耐性 | `extractJsonObject()` が最初の JSON オブジェクトを抽出 |
| 表記ゆれの吸収 | 大文字 enum、数値文字列、0-100 の confidence を正規化 |
| 検証失敗時 | 応答を破棄し mock にフォールバック（UI に理由を表示） |
| 人間レビューの強制 | `requiresHumanReview` はサーバー側で常に `true` に上書き |
| リスク判定の独立性 | 決定ルールは AI 呼び出し前に確定し、AI から書き換え不能 |
| 不一致時 | `agreement: "needs_check"` → UI に「要確認」を大きく表示 |

### 未対応（プロトタイプの制約）

- `customerMessage` の内容フィルタリング（プロンプトインジェクションによる
  不適切な文面生成のチェック）は未実装。実運用では送信前の人間確認に加えて
  NG ワード検査を入れるべきです。
- 出力は HTML ではなくプレーンテキストとして `<pre>` でレンダリングしており、
  React の自動エスケープが効くため XSS の経路にはなりません。

### テスト（`tests/ai-schema.test.ts`）

空文字・散文のみ・途中で切れた JSON・配列・`null`・数値・必須フィールド欠落・
未知の enum 値・範囲外 confidence・型違反など 13 パターンが、
例外を投げずに安全に拒否されることを確認しています。

---

## 5. 監査ログ

- 追記専用（append-only）。更新・削除の API を持たない
- Reject は理由の入力が必須（zod の `refine` で強制、空白のみも拒否）
- 各レコードに判断時点のスナップショット（ルール判定・AI 判定・データソース）を保存
- 破損行はスキップして読み込むため、監査画面が壊れない
- `.data/` は `.gitignore` 済み（判断記録をコミットしない）

### 未対応

- 認証がないため `actor`（誰が承認したか）を記録できていません。
  実運用では staff ID の記録が必須です。
- ログの改ざん検知（ハッシュチェーン等）は未実装です。

---

## 6. ネットワーク到達先の一覧

このアプリがサーバーから接続しうる先は以下の**2 つだけ**です。

| 宛先 | 目的 | 認証 | 無効化 |
|---|---|---|---|
| `api.open-meteo.com` | 天気予報の取得 | なし | `WEATHER_USE_LIVE=false` |
| `AI_BASE_URL` で指定したエンドポイント | 対応案の生成 | Bearer トークン | `AI_API_KEY` 未設定 |

両方を無効化すると、アプリは完全にオフラインで動作します。

---

## 7. デプロイ時のチェックリスト

- [ ] `AI_API_KEY` をホスティング側の環境変数（Vercel の Environment Variables 等）に設定し、
      リポジトリにはコミットしない
- [ ] `NEXT_PUBLIC_` の付いた認証情報が 1 つもないことを確認（`npm test` で自動検証）
- [ ] `.data/` が永続ボリュームか外部ストアに向いているか確認
      （サーバーレス環境ではファイルシステムが揮発するため、監査ログは DB へ移す必要がある）
- [ ] このプロトタイプに認証はない。公開 URL に置く場合は Basic 認証等でアクセスを制限する
