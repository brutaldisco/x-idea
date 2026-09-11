# ADR-018: 削除済み投稿は同期で消し、X のブックマークも外す

- 日付: 2026-09-11
- 状態: 採用
- 関連: ADR-013、設計書 14.3 / 27 章 E-04

## 文脈

Bookmarks API は、X 上で消えた tweet を `data` ではなく `errors[]`（`Not Found Error` / `resource-not-found`）で返す。これまでは `sources.availability = unavailable` にするだけだった。一覧に残るうえ、X 側のブックマークも残る。古い方向の取り込みで、削除済みが枠を占めて新しいページに進みにくくなる。

非公開・閲覧不可は「消えた」ではない。バッジだけ変え、削除しない。

## 決定

- `errors[]` の tweet が Not Found / deleted なら、手動削除と同じ経路で Source を消す（`dismissed_bookmarks`、孤立した `x_posts`、ローカルメディア）。
- Source が無くても `dismissed_bookmarks` に残し、`bookmark.write` があれば `DELETE /2/users/:id/bookmarks/:tweet_id` する。
- Authorization / Forbidden は従来どおり `unavailable`。
- 失敗しても同期全体は止めない。
- 保存済みも同じ判定を適用する。同期／backfill のあと、未確認の Source を保存順に最大 100 件 `GET /2/tweets?ids=` で見る。`x_account.gone_sweep_cursor` で続きから再開する。課金は Post read（$0.005/件）。スレッド月次上限には入れない。

## 影響

- 削除済みは Library から消える。同期では戻さない。
- X から外すには `bookmark.write` が必要（無いときは Settings の「連携を更新」）。
- 非公開の投稿は残る。
