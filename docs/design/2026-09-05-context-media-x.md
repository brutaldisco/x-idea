# 設計書：返信コンテキスト・メディアのローカル保存・X への遷移

> **2026-09-05 追記**: 動画の取り扱い（全量ローカル保存・4 時間超確認 UI・`pnpm dev` 保存役の常用）は **ADR-007 / `docs/design/2026-09-05-video-library.md`** で改定。画像・サムネイルは DB（`media_blobs`）保存、動画本体は手動キュー＋File System Access API による保存に変更された。

- 日付: 2026-09-05
- 状態: **採用（Phase A → B の順で実装）**
- 関連: ADR-003 / ADR-004 / **ADR-005**、実装設計書 8.5（Reader）/ 14.5 / 14.6 / 19 章
- 外部情報の確認日: 2026-09-05（X API v2 公式・料金・Developer Policy）

## 1. 背景（実データで分かったこと）

実ブックマークを取り込んで分かった。

1. ブックマークした投稿の **返信に必要な記事・投稿がある** と、単体では意味が分からない。
2. **画像や動画がセット** でないと内容が不明で意味がない。
3. 最終的に **実際の X に遷移したい** ことがある。

## 2. 確定した方針（2026-09-05 ユーザー決定）

- **PC 利用を主前提**とする。
- 画像・動画の実ファイルは **ローカルディスクに保存** して表示する（Turso の DB 容量を使わない）。
- DB には **相対パスのみ** 保存し、データ引っ越しは **同じパスにコピーするだけ** で引き継げる構造にする。
- 動画は **最高解像度**（最大 bit_rate の mp4）でダウンロードする。
- **4 時間を超える動画** は、ダウンロードして良いかの **確認を表示** してから保存する。

## 3. 何ができて、何ができないか

### 3.1 返信コンテキスト（ツリー）

**できる**

- 直近 7 日の返信は `GET /2/tweets/search/recent?query=conversation_id:{id}` で取れる。`conversation_id` は会話の起点 ID。
- ブックマーク投稿が **起点**（`conversation_id == id`）なら、同一著者の連投（セルフスレッド）を取れる。
- ブックマークが **返信** なら、親は `referenced_tweets`（`replied_to`）で分かり、`GET /2/tweets/:id` で親を 1 件取れる。

**できない／限界**

- 7 日より前の返信は `search/recent` では取れない。`search/all`（フルアーカイブ）は pay-per-use / Enterprise で 1 req/sec・300/15 分。
- 他者の返信ツリー全体は、削除・非公開・protected を含めて完全には取れない。

### 3.2 画像・動画

**できる**

- `expansions=attachments.media_keys` と `media.fields` で、画像は `url`、動画/GIF は `variants`（`bit_rate`・`content_type`・`url` の配列）が取れる。
- 画像は `?name=orig` で原寸、動画は `content_type=video/mp4` で最大 `bit_rate` のものが最高解像度。
- メディアファイル自体の取得（CDN への GET）は API 課金対象外。課金は投稿 read 単位。

**できない／限界**

- 画像・動画の **再配布・公開はしない**。私的アーカイブ用途に限定（Developer Policy）。
- 動画の文字起こしは API では返らない（P3）。
- HLS（`application/x-mpegURL`）はセグメント配信のため保存対象外。mp4 variant が無い動画は保存できない（プレビュー画像＋X へのリンクで代替）。
- 削除・非公開になると CDN のファイルも消える。**ローカル保存はこのリスクの回避にもなる**。

### 3.3 X への遷移

**できる**

- 各 Source に `https://x.com/{username}/status/{tweet_id}`（`x_posts.url` に保存済み）を使った「X で開く」を出せる。追加コストなし。

**できない／限界**

- 削除・非公開・protected の投稿は X 側でも開けない。
- アプリ内で X の完全な会話 UI（いいね数・リアルタイム更新）は再現しない。

## 4. メディアのローカル保存設計（ADR-005）

### 4.1 保存先とパス

```text
{MEDIA_ROOT}/{x_account_id}/{tweet_id}/{media_key}.{ext}
```

- `MEDIA_ROOT` は環境変数。既定 `./data/media`（リポジトリ直下、`.gitignore` 登録）。
- `ext`：photo は **`.webp`**（原寸取得後に変換）、video / animated_gif は `.mp4`。
- DB には **MEDIA_ROOT からの相対パス**（`{x_account_id}/{tweet_id}/{media_key}.{ext}`）だけを保存する。絶対パスは保存しない。
- **アカウントごとにフォルダが分かれる**。Settings にルートと `@username` ごとの絶対パスを出し、リンクで Finder 等を開く（`GET /api/media/folder`）。

### 4.2 DB スキーマ（`media_assets` 拡張、migration `0003`）

| 列 | 型 | 意味 |
| --- | --- | --- |
| `local_path` | TEXT | MEDIA_ROOT 相対パス（保存完了時にセット） |
| `local_bytes` | INTEGER | 保存サイズ |
| `download_status` | TEXT NOT NULL DEFAULT `'pending'` | `pending` / `downloading` / `ready` / `awaiting_confirm` / `skipped` / `failed` |
| `download_error` | TEXT | 失敗理由（ログ用。機密は出さない） |
| `downloaded_at` | TEXT | 保存完了時刻 |

### 4.3 ダウンロードジョブ `media_download`

- 取り込み（`ingestBookmark`）後、各 `media_assets` に対して enqueue（4 時間超を除く）。
- **本番サイト利用時**：同じ PC で `pnpm dev` を起動しておく。本番ページが `127.0.0.1` の保存役へバイトを送り、`MEDIA_ROOT` に書く。
- 画像：`media.url` に `?name=orig` を付けて原寸を取得し、**WebP に変換してから** `{media_key}.webp` として保存。
- 動画/GIF：`variants` から `content_type === "video/mp4"` かつ **最大 `bit_rate`** を選択。
- 取得前に **ディスク空き容量をチェック**（残り 1GB 未満なら `failed` で保留し Reader に表示）。
- `withRetry`（429/5xx は指数バックオフ）。最終失敗は `failed`＋`download_error`。Reader は CDN にフォールバック表示。
- `media.fields` に **`variants` を追加**（`src/server/x/client.ts`）。課金は投稿 read 単位なので追加コストなし。

### 4.4 4 時間超の動画の確認フロー

1. `duration_ms > 14,400,000`（4 時間）の動画は `download_status='awaiting_confirm'` で保留。自動ダウンロードしない。
2. Reader のメディア枠に「**長時間の動画（約 X 時間 Y 分）です。ダウンロードしますか？**」と表示し、「ダウンロード」「しない」を選ばせる。
3. 「ダウンロード」→ `POST /api/media/[id]/download` → `media_download` を enqueue。「しない」→ `skipped`。

### 4.5 配信 `GET /api/media/[id]`

- `id` → `media_assets` を引き、`ready` なら `local_path` のファイルをストリーム返却。
- **Range リクエスト対応必須**（`206 Partial Content`）。長時間動画のシークに必要。
- `Content-Type` は拡張子から（`.jpg`→`image/jpeg`、`.png`→`image/png`、`.webp`→`image/webp`、`.mp4`→`video/mp4`）。`Cache-Control: private, immutable`（media_key は不変）。
- 未保存（`pending` / `awaiting_confirm` / `failed`）は X CDN へ **302 しない**。サーバーがブラウザ相当の UA で取得し、Range を転送してプロキシする（ホットリンク拒否対策）。`?preview=1` はプレビュー画像。
- 動画 URL（mp4 variant）が DB に無い既存行は、`GET /2/tweets/:id` で **1 回だけ**補完してからプロキシする。`variants_json` を書いたあとは再リクエストしない。
- レスポンス後に `after()` でローカル保存を進める（表示を待たない）。
- **パストラバーサル防止**：`path.resolve(MEDIA_ROOT, local_path)` が MEDIA_ROOT 配下であることを必ず検証。
- `APP_PASSCODE` ゲートは他ルートと同じ扱い。

### 4.6 Vercel とローカル実行の違い

| 環境 | `MEDIA_ROOT` | 動作 |
| --- | --- | --- |
| ローカル（`pnpm dev` / `next start`） | 設定あり | ダウンロードしてローカル表示（**本格利用はこちら**） |
| Vercel（serverless） | 未設定 | FS は揮発するためダウンロードしない。未保存時は自前プロキシで表示 |

### 4.7 引っ越し手順

1. **1 アカウントだけ移す**：Settings に出るそのアカウントのフォルダ（`{MEDIA_ROOT}/{x_account_id}/`）を、新しい PC の同じ相対パスへコピーする。
2. **全部移す**：`MEDIA_ROOT` ごとコピーする。
3. パスを変えたい場合は `MEDIA_ROOT` を変えるだけ（DB は相対パスのため変更不要）。フォルダ名（アカウント ID）は変えない。

## 5. 返信コンテキスト

### Phase A（まずここ）

1. **「X で開く」を全 Source に付ける**（`x_posts.url`、追加コストなし）。一覧カードと Reader ヒーローに常設。
2. **メディアのローカル保存＋Reader ギャラリー**（4 章）。動画は `<video controls>`、画像タップでフルスクリーン。
3. **返信の親を 1 件だけ取得**：ブックマークが `replied_to` を持つとき `GET /2/tweets/:id` で親を取得し、Reader に「返信先」カードを表示（1 投稿 = $0.005、24h 重複排除）。
4. **画像 OCR / 説明**：enrich 時にローカル画像を読んで Gemini に inline 送信（`MEDIA_ROOT` 未設定時は CDN から取得）。検索は `media_text` に入れる（既存方針 T-304）。

### Phase B（任意・既定 OFF トグル）

5. **セルフスレッド展開**（既存 T-509）：同期では取らない。Reader で押した Source だけ `search/recent?query=conversation_id:{id} from:{author}`。1 スレッド 25 件・月 $2 上限。
6. **直近 7 日の返信コンテキスト**：`reply_context_enabled`（既定 OFF）。必要な Source だけ `conversation_id` で直近の返信を取得（1 Source 25 件まで、月次上限はスレッド展開と共用）。

### Phase C（やらない／後回し）

7. 他者の返信ツリー全体の収集（完全性が低くコストが読めない）。
8. 7 日より前の会話の `search/all`（必要になったら Enterprise 相談）。
9. 動画の文字起こし（P3）。

## 6. コストの目安

| 内容 | 単価 | 目安 |
| --- | --- | --- |
| ブックマーク取得（Owned Read） | $0.001/件 | 既存どおり |
| メディアファイルのダウンロード | **$0**（CDN 取得は課金対象外） | ディスク容量のみ |
| 返信の親を 1 件取得 | $0.005/件 | 返信 Source のみ |
| セルフスレッド（25 件まで） | $0.005/件 | 1 スレッド最大 $0.125 |
| 直近 7 日の返信取得 | $0.005/件 | 件数に比例 |

同一投稿は 24 時間以内は再課金されない。Developer Console のスペンディングリミットは必須。

## 7. タスク分解（35 章に登録）

| # | タスク | 成果物 | 依存 | DoD |
| --- | --- | --- | --- | --- |
| T-601 | `media_assets` 拡張（migration `0003`）＋ `media.fields` に `variants` 追加 | `drizzle/0003_*`, `src/server/x/client.ts`, `parse.ts` | — | variants が DB に入る |
| T-602 | `media_download` ジョブ（画像 `name=orig`／動画 max bit_rate、4h 保留、空き容量チェック） | `src/server/media/download.ts`, jobs | T-601 | ローカルに保存される |
| T-603 | `GET /api/media/[id]` 配信（Range、302 フォールバック、パス検証） | `src/app/api/media/[id]/route.ts` | T-602 | 動画がシークできる |
| T-604 | Reader ギャラリー＋「X で開く」＋長時間動画の確認 UI | Reader コンポーネント | T-603 | 目視で確認 |
| T-605 | 返信の親取得（`replied_to` → 1 件 lookup、Reader「返信先」カード） | `src/server/x/parent.ts` 等 | T-104 | 親が表示される |
| T-606 | 直近返信コンテキスト（`reply_context_enabled`、既定 OFF、上限つき） | `replyContext.ts` | T-605 | 7 日内の返信が連結表示される |

## 8. 参照（2026-09-05 確認）

- [X API: Conversation ID](https://x-preview.mintlify.app/x-api/fundamentals/conversation-id)
- [X API: pay-per-usage pricing](https://x-preview.mintlify.app/x-api/getting-started/pricing)
- [X API: Usage and Billing / post cap](https://x-preview.mintlify.app/x-api/fundamentals/post-cap)
- [X API: Full-Archive Search Quickstart](https://x-preview.mintlify.app/x-api/posts/search/quickstart/full-archive-search)
- [X API: Data dictionary（media.fields / variants）](https://x-preview.mintlify.app/x-api/fundamentals/data-dictionary)
- [X Developer Policy（表示・削除の扱い）](https://generaltranslation.mintlify.app/developer-terms/policy)
