# Fridgy（フリッジー）

Fridgy は、夫婦のLINEグループで使う、冷蔵庫の在庫管理ボットです。設計方針は「冷蔵庫管理ツール MVP設計方針」ドキュメントを参照してください。

## いまできること（段階1）

- グループにレシートの写真を送る → AI（Claude）が品名・金額を読み取り、確認画面のリンクを返す
- 確認画面（LIFF）で品名・金額・保存場所を直し、食材でない行を外して「在庫に登録」
- 期限は食材マスタの目安日数から自動で入る（マスタにない食材はAIの目安でマスタに追加）
- トークで「在庫」→ 一覧、「追加 いちご 398」→ 手入力で追加
- 一覧画面で残量（たっぷり／半分／少し）、使い切った、捨てたを記録

段階2（朝と夕方の期限通知）、段階3（食費集計）、段階4（献立提案と買い物リスト）はこれから作ります。データの入れ物（残量、捨てたときの残量、買い物リスト）は先に用意してあります。

## 構成

| 役割 | 使うもの |
| --- | --- |
| ボット | LINE Messaging API（`app/api/line/webhook`） |
| 確認・一覧画面 | LIFF（`app/receipts/[id]`、`app/inventory`） |
| サーバー | Next.js（Vercel にデプロイ） |
| DB・画像保存 | Supabase（`supabase/migrations`、`supabase/seed`） |
| レシート読み取り | Claude API（`src/lib/receipt-ai.ts`） |

## セットアップ

1. **Supabase**：プロジェクトを作り、SQL エディタで `supabase/migrations/0001_init.sql` → `supabase/seed/food_master.sql` の順に実行。Storage に非公開バケット `receipts` を作る。
2. **LINE**：LINE Developers でプロバイダーを作り、次の2つのチャネルを作る。
   - Messaging API チャネル：チャネルシークレットとチャネルアクセストークン（長期）を控える。「グループトーク・複数人トークへの参加を許可する」をオン、応答メッセージはオフ。
   - LINE ログインチャネル：LIFF アプリを追加（サイズ Full、エンドポイント URL は Vercel の URL、スコープ `openid`）。チャネルIDと LIFF ID を控える。
3. **Claude API**：Claude Console で API キーを作る。
4. **Vercel**：このリポジトリをインポートし、`.env.example` の値を環境変数に入れてデプロイ。
5. Messaging API チャネルの Webhook URL に `https://<VercelのURL>/api/line/webhook` を設定して「検証」。
6. ボット（表示名「Fridgy」）を友だち追加し、夫婦のグループに招待する。

## 開発

```sh
npm install
cp .env.example .env.local   # 値を入れる
npm run dev
npm test         # 期限計算のテスト
npm run typecheck
```

レシート読み取りは `claude-opus-5-5` を使い、方針判定で断られた場合はサーバー側で別モデルに切り替える設定（`fallbacks: "default"`）を入れています。
