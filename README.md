# Marginalia — X ブックマーク・パーソナルナレッジベース

X でブックマークするだけで、AI が要約・分類・画像解読・関連付けを行い、朝の Briefing・Ask（RAG）・Echo（再浮上）・Atlas（知識星図）・MCP サーバーで「引き出せる知識」に変える個人用 Web アプリ（PWA）。

- 設計書（正本）: [`実装設計書_Xブックマーク・ナレッジベース.md`](./実装設計書_Xブックマーク・ナレッジベース.md)（v3.4）
- worker AI 向け入口: [`AGENTS.md`](./AGENTS.md)
- アカウント・契約: 設計書 **付録H**
- 本番: **https://x-idea.vercel.app**
- 旧版: `docs/archive/`

## スタック（2026-09）

Next.js 16.3 / React 19.2 / Tailwind v4 / shadcn/ui / AI SDK 7 / Drizzle ORM 1.0 / Turso libSQL（vector + FTS5 trigram）/ Vercel Hobby（hnd1）/ Gemini（3.5 Flash-Lite・3.6 Flash・Embedding 2）/ mcp-handler 2.x / PWA（`/sw.js`）

## セットアップ

```bash
pnpm install
cp .env.example .env.local   # 付録D の変数を設定
pnpm db:migrate              # drizzle/ の SQL を適用（ローカルは file:local.db）
pnpm db:seed                 # settings / 初期カテゴリ / job_schedules
pnpm dev
```

## 外部サービス

| サービス | 用途 | 備考 |
| --- | --- | --- |
| Turso | 本番 DB `libsql://x-idea-brutaldisco.aws-ap-northeast-1.turso.io` | Free。トークンを Vercel に設定 |
| Vercel | `https://x-idea.vercel.app`（Hobby, hnd1） | プロジェクト名 `x-idea`。接続手順は付録H.4 |
| X Developer Console | OAuth 2.0 PKCE、bookmarks（Owned Reads $0.001/リソース） | **審査・クレジット購入が必要なことがある**。完了まで `x_api_enabled=OFF` |
| Google AI Studio | Gemini API キー | 無料で開始。有料は Settings トグル OFF のまま |
| cron-job.org | 1 分間隔で `POST https://x-idea.vercel.app/api/jobs/tick`（`Authorization: Bearer <CRON_SECRET>`） | GitHub Actions schedule でも可 |

## 運用メモ

- 同期・ジョブ・AI 予算の状態は Settings。残量メーターは「なくなったら追加」。X の公式残量を出すなら `X_BEARER_TOKEN`。
- Gemini の日次クォータは太平洋時間 0:00（JST 16:00/17:00）にリセット。
- MCP エンドポイント: `https://x-idea.vercel.app/api/mcp`（Settings でトークン発行、`Authorization: Bearer`）。
- 有料プラン（X クレジット、Gemini 課金、スレッド展開、返信取得、Anthropic/OpenAI）はすべて Settings トグル既定 OFF。契約後に人間が ON にする。
- 画像・動画の実ファイルはローカルの `MEDIA_ROOT`（既定 `./data/media`）に **アカウントごと** 保存する。Settings にパスとフォルダを開くリンクがある。引っ越しは `{MEDIA_ROOT}/{x_account_id}/` を同じ相対パスへコピーする。Vercel では保存せずプロキシ表示する。
- **PWA**：Chrome（デスクトップ / Android）でアドレスバーまたは Settings の「ホーム画面に追加」からインストールできる。Service Worker は `/sw.js`。一度開いたページはオフラインでも読める。iOS は Safari の共有 →「ホーム画面に追加」。
