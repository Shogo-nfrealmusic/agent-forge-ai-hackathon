# Demo 手順（所要 5 分）

## 0. 準備

```bash
npm install
npm run dev          # http://localhost:3000
```

環境変数は**設定不要**です。`AI_API_KEY` が無ければ自動的に mock adapter で動きます。

Wi-Fi が不安定な会場では、天気も含めて完全オフラインにできます:

```bash
echo "WEATHER_USE_LIVE=false" >> .env.local
npm run dev
```

デモを毎回まっさらな状態から始めたい場合:

```bash
rm -rf .data
```

---

## 1. 予約一覧（http://localhost:3000）

**話すこと**

- mock の屋外撮影予約が 7 件。実システムには繋いでいない
- 上部のバッジで、天気とAIのデータソースが常に見える
  （`ai: mock (AI_API_KEY 未設定)` = キーなしでも動く）
- `demo-booking-001`〜`006` はシナリオを固定するため fixture 天気、
  `demo-booking-007` だけは直近日付で **ライブの Open-Meteo** を叩く

---

## 2. High リスク: `demo-booking-004`（Enoshima / 降水確率 85%）

予約カードをクリック → 自動で解析が走る（ローディング表示）。

**見せるポイント**

1. **天気サマリー** — 降水確率 85%、データソースのバッジ
2. **決定ルール判定 = HIGH** — 「降水確率 85% (>= 80%)」と、どのルールが効いたかを明示
3. **AI 判定 = HIGH** — 推奨アクション `reschedule`、confidence、`ルール判定と一致` バッジ
4. **顧客向けメッセージ案** — 振替を提案する日本語の下書き。「送信機能なし」バッジ付き

**話すこと**

> AI の判定だけを見せるのではなく、必ずルールの判定を並べて出します。
> AI が壊れてもルールは壊れないので、スタッフは常に根拠のある数字を見られます。

---

## 3. ★ 要確認ケース: `demo-booking-002`（Yoyogi Park / 降水確率 65%）

**このデモの核心です。**

- 決定ルール = **LOW**（70% 未満なので該当ルールなし）
- AI = **MEDIUM**（AI は 60% 台でも崩れると判断）
- → 画面上部に**黄色の「要確認」バナー**が出る
- → 推奨アクションは `contact_staff` に落ちる
- → 安全側の `MEDIUM` を運用レベルとして併記

**話すこと**

> AI とルールが食い違ったとき、勝手にどちらかを採用しません。「要確認」として人間に戻します。
> エージェントが自信満々に間違えるのを、構造で防いでいます。

---

## 4. 警報ケース: `demo-booking-006`（Kamakura / 台風接近 + 風速 42 km/h）

- ルール判定が **3 つ同時にヒット**（警報・強風・…）して HIGH
- 「警報・注意報」欄に台風の注意報が表示される

**話すこと**

> ルールは複数ヒットしたら最も重いレベルを採用します。根拠は全部画面に出します。

---

## 4.5. ライブ天気: `demo-booking-007`（Shinjuku Gyoen / 2026-07-28）

- 天気サマリーのバッジが **`source: Open-Meteo`**（グレー、`degraded` なし）になる
- 実際の予報値がそのまま入っている

**話すこと**

> 天気は無料の Open-Meteo を API キーなしで叩いています。
> 他の予約は予報範囲（約16日先）より先の日付なので fixture にフォールバックしていて、
> そのフォールバック自体も画面で明示されます。

> **注意**: `demo-booking-007` の日付（2026-07-28）を過ぎるとこの予約もフォールバックします。
> デモ前に `src/lib/fixtures/bookings.ts` の日付を直近に更新してください。

---

## 5. スタッフ判断 → 監査ログ

`demo-booking-004` の画面下部で:

1. 理由欄に何か入力（例: 「屋内スタジオの空きがあるため振替ではなく変更で提案したい」）
2. **Reject** を押す
   - → 「監査ログに記録しました」と表示
   - → `bookingSystemMutated: false` が画面に出る
3. 理由を空にして **Reject** を押す
   - → 「Reject の場合は理由を入力してください」で止まる（理由なしでは記録できない）
4. **Approve** を押す
   - → `staff approved recommendation (no booking system call was made)` と記録される

**話すこと**

> どのボタンを押しても、予約システム・決済・メール送信は一切呼ばれません。
> ローカルの監査ログに 1 行追記されるだけです。これはテストで固定してあります。

---

## 6. 監査ログ画面（ヘッダーの「監査ログ」）

- 判断・予約 ID・時刻・ルール判定・AI 判定・理由・データソースが 1 件ずつ並ぶ
- 不一致だったものには「要確認」バッジが付く
- 全件に `no booking system call was made` の注記

---

## 7. 障害時の挙動を見せる（任意・インパクト大）

天気 API を落とした状態を作ります。

```bash
# 別ターミナルで
AI_BASE_URL=https://127.0.0.1:9/v1 AI_API_KEY=dummy npm run dev
```

予約詳細を開くと:

- AI 欄に「AI provider への接続に失敗しました … mock を使用しました」と表示
- それでも**画面は壊れず**、ルール判定・対応案・メッセージ案がすべて出る

**話すこと**

> 外部依存が落ちてもデモが死なないように、天気も AI も二重化しています。

---

## 8. テストを見せる

```bash
npm test
```

```
Test Files  9 passed (9)
     Tests  115 passed (115)
```

特に読み上げる価値があるもの:

- `Approve performs no external I/O > does not call fetch when a decision is recorded`
- `the whole source tree is free of real contact details`
- `no "use client" module reads process.env`
- `parseAiResponse — malformed input is handled safely`（13 パターン）

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| 天気が全部 fixture になる | 予約日が Open-Meteo の予報範囲（約16日先）外。想定内の挙動でフォールバック中 |
| `ai: mock` バッジが消えない | `.env.local` に `AI_API_KEY` を設定して dev サーバーを再起動 |
| 監査ログが空 | `.data/audit-log.jsonl` を確認。削除した場合は再度 Approve すれば再生成される |
| ポート 3000 が埋まっている | `npm run dev -- -p 3001` |
