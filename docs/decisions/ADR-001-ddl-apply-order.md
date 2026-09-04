# ADR-001: 19章 DDL の適用順

- 日付: 2026-09-04
- 状態: 採用

## 文脈

設計書 19 章の DDL は説明順で並んでおり、FK の参照先が後に出てくる箇所がある。

- `x_bookmark_folders.category_id` → `categories`
- `source_chunks.kc_id` → `knowledge_cards`

## 決定

実行可能な正本は `drizzle/0000_init.sql`。適用順は次のとおり。

1. `settings` / `x_account` / `categories`
2. `x_bookmark_folders` / `x_post_folders`
3. `sources` と一次情報（`x_posts` / `articles` / …）
4. `knowledge_cards` を `source_chunks` より先に作成
5. ベクトル索引・FTS5 は個別 statement。ローカル `file:` で失敗したらスキップし、Turso では適用する

## 結果

マイグレーションは `CREATE TABLE IF NOT EXISTS` で冪等。初回リクエスト（`/api/health` または `/api/jobs/tick`）でも `ensureSchema()` が適用する。

Next.js 16.3.4 では `experimental.partialPrefetching` は未サポートのため未設定。`cacheComponents` のみ有効。Route の `runtime = "nodejs"` は cacheComponents と両立しないので付けない。
