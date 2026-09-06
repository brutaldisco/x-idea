# ADR-013: 削除したブックマークは同期で戻さない

- 日付: 2026-09-06
- 状態: 採用
- 関連: 設計書 8.3 / 14.3 / 19 章

## 文脈

Library の削除は `sources`（と孤立した `x_posts`）を消すだけだった。X 側のブックマークは残る。差分同期が head を見失うと直近ページを再走査し、無い Source を新規として取り込み直していた。古いブックマークを X 上で手作業で外すのは現実的でない。

## 決定

- 削除時に `(x_account_id, tweet_id)` を `dismissed_bookmarks` に残す。`ingestBookmark` はこの表にある tweet を作らない。
- ベストエフォートで `DELETE /2/users/:id/bookmarks/:tweet_id` を呼ぶ。`bookmark.write` が無い・失敗しても削除自体は成功させる。
- 新規 OAuth スコープに `bookmark.write` を足す。既存連携は「連携を更新」（`reauth`）で取り直す。Developer Portal 側にも同スコープが必要。
- 消した tweet が `last_sync_head_tweet_id` なら、残っている最新 tweet に head を進める。

再ブックマークしてまた取り込みたい場合は、今は除外を手動解除する UI は持たない。

## 影響

- 削除した投稿は、X にブックマークが残っていても同期で戻らない。
- X から外すには連携の更新が必要なことがある。
