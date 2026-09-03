# Marginalia — X ブックマーク・パーソナルナレッジベース

X でブックマークするだけで、AI が要約・分類・画像解読・関連付けを行い、朝の Briefing・Ask（RAG）・Echo（再浮上）・Atlas（知識星図）・MCP サーバーで「引き出せる知識」に変える個人用 Web アプリ（PWA）。

- 設計書（正本）: [`実装設計書_Xブックマーク・ナレッジベース.md`](./実装設計書_Xブックマーク・ナレッジベース.md)（v3.0, 2026-09-04）
- worker AI 向け入口: [`AGENTS.md`](./AGENTS.md)
- 旧版: `docs/archive/`

## スタック（2026-09）

Next.js 16.3 / React 19.2 / Tailwind v4 / shadcn/ui / AI SDK 6 / Drizzle ORM 1.0 / Turso libSQL（vector + FTS5 trigram）/ Vercel Hobby（hnd1）/ Gemini（3.5 Flash-Lite・3.6 Flash・Embedding 2）/ mcp-handler 2.x / Serwist

## セットアップ（Phase 0 完了後に有効）

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
| Turso | 本番 DB `libsql://x-idea-brutaldisco.aws-ap-northeast-1.turso.io` | Free。rows read / storage を月次で確認 |
| Vercel | ホスティング（Hobby, hnd1） | `CRON_SECRET` 等を環境変数に |
| X Developer Console | OAuth 2.0 PKCE、bookmarks（Owned Reads $0.001/リソース） | **スペンディングリミット必須** |
| Google AI Studio | Gemini API キー | 無料枠は日次クォータが小さい。AI Studio の Rate limits 画面で実値を確認し `settings.ai_lane_caps_json` を合わせる |
| cron-job.org | 1 分間隔で `POST /api/jobs/tick`（`Authorization: Bearer <CRON_SECRET>`） | GitHub Actions schedule でも可 |

## 運用メモ

- 同期・ジョブ・AI 予算の状態は Settings → Sync & Jobs 画面。
- Gemini の日次クォータは太平洋時間 0:00（JST 16:00/17:00）にリセット。
- MCP エンドポイント: `https://<domain>/api/mcp`（Settings でトークン発行、`Authorization: Bearer`）。
