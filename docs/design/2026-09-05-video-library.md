# 設計書：動画の手動ダウンロード・キュー・Videos ライブラリ

- 日付: 2026-09-05
- 状態: **採用（T-607 → T-612 の順で実装）**
- 関連: ADR-005（一部改定）/ **ADR-007** / ADR-006、実装設計書 8 章（SC-15）/ 14.6 / 19 章 / 35 章
- 外部情報の確認日: 2026-09-05（File System Access API 対応状況、Vercel Functions 制限）

## 1. 背景と確定方針（2026-09-05 ユーザー決定）

### 1.1 背景

- 容量破綻の主因は **動画**。画像は WebP 化で十分小さい。
- 本番 URL（Vercel）からローカル PC への直接保存は、ブラウザのセキュリティ制約上できない。前回の「`pnpm dev` 保存役（コンパニオン）」はこの制約の回避策だったが、**普段使いでローカルサーバーを常駐させない** 方針が確定した（他プロジェクトの開発サーバーと競合するため）。
- よって動画の全量保存は断念し、**見たいものだけを手動で選んで保存する** 構造にする。

### 1.2 確定方針

| 対象 | 保存先 | 方式 |
| --- | --- | --- |
| テキスト | Turso（DB） | 従来どおり |
| 画像（photo） | **Turso（DB）** | 原寸取得 → WebP 化 → `media_blobs` に自動保存 |
| 動画サムネイル | **Turso（DB）** | `preview_url` を WebP 化 → `media_blobs` に自動保存 |
| 動画本体 | **ユーザーが選んだローカルフォルダ** | 手動キュー（最大 15 件）→ File System Access API で書き込み。自動保存しない |

- 動画を見るだけなら **X へ遷移**（Reader の「X で見る」）。
- 保存した動画は **Videos タブ（SC-15）** で一覧・再生・分類する。
- ローカルサーバー（`pnpm dev` 保存役）は **開発用途に限定** し、通常運用の案内からは外す。

## 2. ブラウザ選定：File System Access API

### 2.1 採用理由

「ローカルサーバー不要」「OS に見えるフォルダ構造」「アプリ内プレーヤーで再生」「フォルダ単位で引っ越し」をすべて満たす唯一の手段が **File System Access API**（`showDirectoryPicker`）である。

- ユーザーが一度だけ保存ルート（例：`~/Movies/x-idea`）を選ぶと、ブラウザがそのフォルダへの読み書きハンドルを返す。
- ハンドルは IndexedDB に永続化でき、以降はセッションごとの権限再許可（ボタン 1 クリック）だけで使える。
- 実ファイルは Finder に普通に見えるため、フォルダ単位のコピー・バックアップ・引っ越しがそのままできる。

### 2.2 対応ブラウザ（2026-09-05 確認）

| ブラウザ | `showDirectoryPicker` | 扱い |
| --- | --- | --- |
| Chrome / Edge（desktop） | ✅ 86+ | **フル機能** |
| Chrome Android | ✅ 132+ | 動作するが主対象外（PC 前提） |
| Safari / Firefox | ❌（ベンダーが否定的立場） | **フォールバック**（4.6） |

- 本アプリは原文翻訳を Chrome 内蔵機能に依存しており（ADR-006）、利用ブラウザは Chrome 前提で矛盾しない。
- 参考: [Web features explorer - File system access](https://web-platform-dx.github.io/web-features-explorer/features/file-system-access/)

### 2.3 従来方式との関係

- `MEDIA_ROOT` へのローカル保存と `/api/media/companion`（保存役）は **開発用途に限定** して残すが、Settings の案内・自動同期（`TickOnMount` からの呼び出し）は撤去する。
- 既存のローカルファイルは `media_assets.local_path` があれば従来どおり配信する（後方互換）。新規保存は DB blob が正。

## 3. 画像・サムネイル：DB blob 保存（`media_blobs`）

### 3.1 スキーマ（migration `0004`）

```sql
CREATE TABLE media_blobs (
  media_id TEXT PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL DEFAULT 'image/webp',
  data BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- `media_assets` とは別テーブルにし、一覧系クエリ（`media_assets` 走査）を blob のサイズから隔離する（`media_embeddings` と同じ分離パターン）。
- 画像は `?name=orig` 原寸 → **WebP（quality 82）** に変換して格納。動画/GIF は `preview_url` を同様に WebP 化して格納（本体は保存しない）。
- 変換後が 20MB を超える異常系は `failed` 扱い（CDN プロキシ表示にフォールバック）。

### 3.2 容量の目安

| 項目 | 目安サイズ | 5GB（Turso 無料枠の目安）での件数 |
| --- | --- | --- |
| 画像 WebP（q82） | 60〜200KB/枚 | 約 2.5 万〜8 万枚 |
| 動画サムネイル WebP | 30〜80KB/件 | さらに軽い |

- 個人のブックマークペース（月数百件）では **年単位の余裕** がある。テキスト・写真のみなら容量破綻は事実上起きない、というユーザーの想定を裏付ける。
- Settings に **DB メディア使用量メーター**（件数・`SUM(bytes)`・無料枠に対する割合の目安）を追加し、逼迫を検知できるようにする。

### 3.3 配信（`GET /api/media/[id]` の変更）

1. `media_blobs` に blob があればそれを返す（`Content-Type: image/webp`、`Cache-Control: private, immutable`）。
2. なければ従来どおり X CDN をプロキシし、`after()` で WebP 化 → blob 保存（表示は待たない）。
3. `?preview=1` も同じ blob を返す（動画サムネイルはこれが本体）。
4. 旧 `local_path` のファイルがあれば blob より後順でフォールバック配信（開発環境の後方互換）。

## 4. 動画：手動ダウンロードキューと Videos ライブラリ

### 4.1 スキーマ（migration `0004`）

```sql
CREATE TABLE video_folders (             -- 動画の分類フォルダ（1 階層のみ）
  id TEXT PRIMARY KEY,
  x_account_id TEXT NOT NULL REFERENCES x_account(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (x_account_id, name)
);

CREATE TABLE video_downloads (           -- キュー兼ライブラリ台帳
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL UNIQUE REFERENCES media_assets(id) ON DELETE CASCADE,
  x_account_id TEXT NOT NULL,
  folder_id TEXT REFERENCES video_folders(id) ON DELETE SET NULL,  -- NULL = 未分類
  status TEXT NOT NULL DEFAULT 'queued', -- queued | downloading | ready | failed | canceled
  rel_path TEXT,                         -- ルート相対: {x_account_id}/{folder}/{file}.mp4
  bytes INTEGER,
  error TEXT,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  downloaded_at TEXT
);
CREATE INDEX idx_video_downloads_status ON video_downloads (status, queued_at);
```

- `UNIQUE(media_id)`：同じ動画の二重キューを防ぐ。再キューは `failed`/`canceled` からの retry で行う。
- キュー上限は **`status='queued'` の件数が 15 未満のときだけ enqueue 可**。超過時は API が 409 を返し、UI は「キューがいっぱいです（15 件）。実行してから追加してください」と出す。
  - ブラウザ側の制約は特にない（キューは DB 行、実行は逐次 1 件）。15 件は「1 回のまとめ実行で現実的に終わる量」として妥当。実行時間の目安は UI に出す（4.5）。

### 4.2 物理フォルダ構造（ユーザーが選んだルート配下）

```text
{選択したルート}/
  {x_account_id}/                    ← アカウント単位（引っ越しはこのフォルダごとコピー）
    {tweet_id}_{media_key}.mp4       ← 未分類（アカウント直下）
    {フォルダ名}/                     ← ユーザー作成（1 階層のみ）
      {tweet_id}_{media_key}.mp4
```

- アカウントフォルダ名は **`x_account_id`**（安定。username は X 側で変わりうるため使わない）。Videos 画面と Settings に `@username ↔ フォルダ名` の対応を表示する。
- 分類フォルダは **1 階層のみ**。名前はサニタイズ（`/..` 禁止、120 文字まで、既存 `safeMediaSegment` 相当の規則）し、同名は `(2)` などで回避。
- **引っ越し**：新しい PC で Videos タブを開き → ルートを再選択 → アカウントフォルダをコピーしておけば、`rel_path` が一致するためそのまま再生できる（DB 変更不要）。

### 4.3 サーバー API

| API | 役割 |
| --- | --- |
| `POST /api/videos/queue` `{ media_id }` | キュー投入。15 件上限・重複は 409 |
| `GET /api/videos/queue` | キュー＋ライブラリ一覧（サムネイル・投稿抜粋・フォルダ・状態） |
| `POST /api/videos/queue/[id]` `{ action: "cancel" \| "retry" }` | 取消／再試行 |
| `POST /api/videos/queue/[id]/complete` `{ rel_path, bytes }` | クライアント書き込み完了の記録（`ready` 化） |
| `POST /api/videos/[id]/move` `{ folder_id }` | フォルダ移動（DB 更新。実ファイル移動はクライアントが実施） |
| `DELETE /api/videos/[id]` | ライブラリから削除（DB 行削除。実ファイル削除はクライアントが実施） |
| `POST /api/videos/folders` `{ name, account_id }` / `DELETE /api/videos/folders/[id]` | フォルダ作成／削除 |
| `GET /api/media/[id]/file` | 動画本体の **Range 対応プロキシ**（max `bit_rate` の mp4。`maxDuration = 300`） |

- すべて `isSameOrigin` チェックつき（`GET /api/media/[id]/file` は既存メディア配信と同じゲート方針）。
- 動画 URL が無い既存行は `refreshMediaFromTweet`（tweet lookup、1 回だけ）で補完してからプロキシする（既存挙動を踏襲）。
- フォルダ削除時は **中身の動画を未分類（`folder_id = NULL`）に移す**（ファイルは残す）。動画の削除は個別に行う設計とし、誤削除を防ぐ。

### 4.4 ダウンロード実行（クライアント、Videos タブ）

低速回線でのタイムアウトを避けるため、**チャンク分割＋レジューム** を採用する。

1. 「ダウンロード開始」ボタン（ユーザー操作を起点に `requestPermission({ mode: "readwrite" })` で権限再許可）。
2. キューを **逐次 1 件ずつ** 処理（並列にしない。低速回線での帯域競合とタイムアウトを避ける）。
3. 1 件の処理：
   - ルート → `{x_account_id}` →（あれば）フォルダ、の順にディレクトリハンドルを `getDirectoryHandle(..., { create: true })` で解決。
   - ファイル `{tweet_id}_{media_key}.mp4` を `getFileHandle({ create: true })` → `createWritable({ keepExistingData: true })`。
   - **8MB チャンク**で `Range: bytes=offset-` を `GET /api/media/[id]/file` に投げ、返ってきた分を `writable.seek(offset)` → `write()`。最初の応答の `Content-Range` から総サイズを得て進捗バーに反映。
   - 失敗（タイムアウト・ネットワーク断）したら **チャンクサイズを半減**（最小 1MB）して同じオフセットから再試行。3 連続失敗で `failed`。
   - 進捗（`received` バイト数）は IndexedDB に保存し、**ページを閉じても途中再開**できる。
4. 完了したら `writable.close()` → `complete` API で `ready` 化。
5. `navigator.onLine === false` または `offline` イベントで中断し、`online` 復帰時に「再開しますか？」を出す（自動再開はしない。実行タイミングはユーザーが選ぶ）。

**Vercel Hobby の 300 秒上限との関係**：1 リクエスト 8MB なら 100KB/s の低速回線でも約 80 秒で完了するため、関数タイムアウト（300 秒）を事実上回避できる。チャンク半減でさらに遅い回線にも対応する。

### 4.5 実行時間の目安表示

キュー一覧に「合計の目安時間」を出す。総サイズは未ダウンロード時点では不明なため、初回は `duration_ms` からの粗い推定（例：1 分あたり 10MB 仮定）か「不明」表示とし、1 件目の実測速度で残り時間を更新する簡易方式とする。

### 4.6 非対応ブラウザのフォールバック

- Safari / Firefox では Videos タブの保存機能を無効化し、「このブラウザではフォルダ保存に対応していません。Chrome / Edge で開いてください」と案内。
- その場合でも `<a href="/api/media/[id]/file" download>` による **通常ダウンロード**（OS のダウンロードフォルダへ）だけは使えるようにする。ただしライブラリ管理・プレーヤーの対象外であることを明記する。

## 5. 画面設計

### 5.1 SC-15 Videos（新規タブ）

下部タブを **6 項目** に変更：**Today / Inbox / Library / Videos / Ask / Settings**（Videos は 4 番目）。

構成（上から）：

1. **保存フォルダカード**：リンク状態バッジ（未リンク／リンク済）＋「保存フォルダを選ぶ / 再リンク」ボタン＋ルートフォルダ名。未リンク時はここだけ有効。
2. **ダウンロードキュー**：件数（`N / 15`）＋「ダウンロード開始」ボタン。各アイテムはサムネイル・投稿抜粋・`@username`・状態・進捗バー・取消。`failed` は理由と「再試行」。
3. **ライブラリ**：フォルダチップ（`すべて / 未分類 / {フォルダ}… / ＋新規フォルダ`）。グリッドカードはサムネイル（WebP blob）・再生時間バッジ・投稿抜粋・保存日。操作メニューに「フォルダ移動」「削除」「X で開く」「Source を開く」。
4. **プレーヤー**：カードをタップで **モーダル**（PC は中央大きめ、モバイルは全画面）。`<video controls playsInline>` に `handle.getFile()` → `URL.createObjectURL()` を渡す（ブラウザ標準 UI。閉じたら `revokeObjectURL`）。シーク・音量・全画面はブラウザ標準に任せる。

### 5.2 Reader（SC-06）の変更

- 動画タイルは **サムネイル＋「X で見る」**（実装済み）に加えて **「あとで保存」** ボタンを出す。
  - 押下 → `POST /api/videos/queue`。成功で「キューに追加しました（Videos タブで実行）」、409 なら上限/重複メッセージ。
  - すでに `ready` の動画には「保存済み」バッジ＋「Videos で開く」リンク。
- 旧「長時間動画の確認 UI」は廃止済み。4 時間超かどうかに関わらず、保存はすべて手動キュー経由。

### 5.3 Settings（SC-05）の変更

- 「この PC に画像・動画を保存する」（保存役ガイド）を撤去。
- 代わりに **メディア使用量カード**：DB 内の画像・サムネイル件数と合計サイズ（目安）、動画ライブラリの件数・合計サイズ、Videos タブへのリンク。
- `MEDIA_ROOT` / 保存役は「開発者向け」折りたたみの中に注記のみ残す。

## 6. エッジケース

| ケース | 挙動 |
| --- | --- |
| 元投稿の削除・非公開 | CDN 404 → `failed`（「元投稿が削除された可能性があります」）。サムネイルとテキストは残る |
| 権限失効（ブラウザ再起動など） | 次回操作時に `requestPermission` を促す（ユーザー操作起点の制約） |
| ルートフォルダの変更・紛失 | 「再リンク」で選び直し。`rel_path` が一致すれば既存ライブラリはそのまま使える |
| ファイルだけ手動で消した | 再生時に `NotFoundError` → 「ファイルが見つかりません」＋再ダウンロード導線（`retry`） |
| Source 削除 | `media_assets` カスケードで `video_downloads` 行も消える。**実ファイルは残る**（サーバーからユーザーのフォルダは触れないため）。Finder で手動削除してもらう旨を削除確認ダイアログに明記 |
| 二重 enqueue | `UNIQUE(media_id)` + 409 →「すでにキュー／ライブラリにあります」 |
| HLS しか無い動画 | mp4 variant なし → enqueue 時に 422（「この動画は保存できません」） |

## 7. タスク分解（35 章に登録）

| # | タスク | 成果物 | 依存 | DoD |
| --- | --- | --- | --- | --- |
| T-607 | `media_blobs` 追加＋画像/サムネイルの DB 保存と配信（migration `0004`） | `drizzle/0004_*`, `src/server/media/download.ts`, `src/app/api/media/[id]/route.ts` | T-603 | 本番で画像が DB から配信される |
| T-608 | `video_folders` / `video_downloads`＋キュー API（15 件上限、enqueue/cancel/retry/complete/move/folders） | `drizzle/0004_*`, `src/app/api/videos/*`, `src/server/videos/*` | T-607 | 16 件目が 409 になる |
| T-609 | `GET /api/media/[id]/file`（max bit_rate mp4、Range プロキシ、`maxDuration = 300`） | `src/app/api/media/[id]/file/route.ts` | T-603 | Range で部分取得できる |
| T-610 | FS Access クライアント（フォルダ選択・権限・IndexedDB 永続化、8MB チャンク DL＋レジューム） | `src/lib/video-store.ts` | T-609 | 中断→再開で最後まで落ちる |
| T-611 | Videos タブ SC-15（キュー UI、ライブラリ grid、プレーヤー、フォルダ作成/移動/削除） | `src/app/(tabs)/videos/*`, `src/components/videos/*` | T-608, T-610 | キュー→DL→再生→移動が一気通貫 |
| T-612 | Reader「あとで保存」＋Settings 整理（保存役案内の撤去、DB 使用量メーター） | Reader, Settings | T-608 | 本番 Settings に `pnpm dev` 案内が出ない |

## 8. 参照（2026-09-05 確認）

- [Web features explorer - File system access](https://web-platform-dx.github.io/web-features-explorer/features/file-system-access/)（Chrome/Edge 86+、Safari/Firefox 非対応）
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)（Hobby は最大 300 秒）
- [MDN: FileSystemDirectoryHandle](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryHandle) / [Window: showDirectoryPicker()](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
