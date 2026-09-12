# ADR-020: 動画の保存フォルダは X アカウントごとに選ぶ

- 日付: 2026-09-12
- 状態: 採用
- 関連: ADR-002、ADR-007、設計書 8.5 / 8.10 / 19 章、`docs/design/2026-09-05-video-library.md`

## 文脈

動画の実ファイルはアカウント ID 配下（`{x_account_id}/…`）に置く。一方、ルートフォルダ名は `settings.video_save_folder_name` の 1 本、ブラウザの File System Access ハンドルも IndexedDB の `"root"` 1 本だった。複数 X アカウントを切り替えると、別アカウントでも同じフォルダを見せていた。

## 決定

- フォルダ名は `x_account.video_save_folder_name` に持つ。`GET/POST /api/settings/video-folder` は表示中アカウント（`x_ctx`）だけを読む・書く。
- ブラウザの書き込みハンドルは IndexedDB キー `root:{accountId}`。未設定のときは旧キー `"root"` を読む（既存リンクの互換）。
- Settings のカードは表示中アカウント用。未連携ならフォルダを選べない。
- `settings.video_save_folder_name` は残す。0015 で既存値を全アカウントへコピーしたあと、新規の正本には使わない。

## 影響

- アカウントを切り替えると、別フォルダをリンクできる。同じフォルダを選んでもよい。
- 既存ユーザーはコピーされたフォルダ名と旧ハンドルで、再リンクするまで従来どおり動く。
