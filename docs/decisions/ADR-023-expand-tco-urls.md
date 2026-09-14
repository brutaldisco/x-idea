# ADR-023: 記事・投稿の t.co は API の expanded_url に展開する

- 日付: 2026-09-14
- 状態: 採用
- 関連: 実装設計書 15.1 / 15.3、T-207 / T-221

## 文脈

X の本文（`tweet.text` / `note_tweet.text` / `article.plain_text`）はリンクを `https://t.co/…` のまま返す。X アプリは `entities.urls` の展開先を見せる。このアプリは短縮 URL をそのままリンク化していたため、記事中の外部リンクが t.co（X 上のリダイレクト）になり、アプリ外では開けないことがあった。

## 決定

1. **表示も保存も** `unwound_url` → `expanded_url` の順で外部 URL に置き換える。X の省略表示（`display_url`）は使わない。
2. 展開マップは `tweet.entities.urls` + `note_tweet.entities.urls` を投稿カード用、`article.entities.urls` を `article_urls` として `raw_entities_json` に残す。記事本文中の URL は別記事取得の対象にしない。
3. 既存の t.co 本文は Reader 表示時に同じマップで展開し、X Article は本文に t.co が残っていれば再ハイドレートして書き換える。
4. t.co を HTTP で辿って解決しない。展開先は API エンティティだけを正とする。

## 影響

- Reader の原文・記事に出るリンクが X アプリと同じ外部 URL になる。
- 原文カラムの書き換えは URL 展開のみ（AI は触れない）。
- 記事 HTML のプレーンな URL は `<a href>` にする。
