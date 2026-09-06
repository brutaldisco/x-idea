# AGENTS.md — worker AI 向け入口

このリポジトリは **Marginalia**（X ブックマーク・パーソナルナレッジベース）の実装リポジトリです。

## まず読むもの

1. `実装設計書_Xブックマーク・ナレッジベース.md`（v3.1）— 唯一の正本。
   - 担当タスクは **35 章「実装タスク分解」** から選ぶ（T-xxx）。
   - 実装規約は **付録F「worker AI 向け実装ガイド」**。
   - 画面は 8・10 章、DB は 19 章、AI は 16 章＋付録B、API は 21 章、ジョブは 17 章。
2. `README.md` — セットアップと運用手順。

## 絶対に守ること（付録F 4 項の要約）

- `user_id` を追加しない。任意ゲートは `APP_PASSCODE` と許可メール 1 件の Google ログインだけ（`/unlock`）。マルチユーザーのログイン UI は作らない。
- 全件 SELECT・ベクトルのフルスキャン（`vector_distance_cos` 単独）をしない。必ず LIMIT / `vector_top_k`。
- AI 呼び出しは必ず `budget.guard(lane)` 経由。429 で有料へ自動切替しない。
- 原文カラム（`x_posts.text`, `articles.content_*`）を AI が書き換えない。ユーザー記述カラム（`user_note`, `my_*`）に AI が書かない。
- トークン・API キーをログやクライアント応答に出さない。

## 作業の流れ

1. `feat/T-xxx-短い説明` ブランチを切る。1 タスク 1 PR。
2. 設計書と実挙動が食い違ったら、実挙動を正として **同じ PR で設計書と `docs/decisions/ADR-xxx.md` を更新**する。
3. PR 本文に：タスク ID、DoD チェックリスト、寄与する受け入れ条件（A-xx）、UI ならスクリーンショット。
4. Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:`）。

## 確定済みの外部リソース

- GitHub: `https://github.com/brutaldisco/x-idea.git`
- Turso（本番）: `libsql://x-idea-brutaldisco.aws-ap-northeast-1.turso.io`（トークンは環境変数 `TURSO_AUTH_TOKEN`）
- Vercel: Hobby、リージョン `hnd1`、本番 URL **`https://x-idea.vercel.app`**
- アカウント作業と有料トグル: 設計書 **付録H**

有料トグル（`x_api_enabled` / `ai_paid_enabled` / `thread_expand_enabled` / `reply_context_enabled` / `paid_providers_json`）は既定 OFF。人間の指示なしに ON にしない。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
