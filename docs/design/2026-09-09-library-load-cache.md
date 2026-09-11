# 設計書：Library の読み込み・キャッシュ再編

- 日付: 2026-09-09
- 状態: **採用（T-216 / T-217 / T-218 実装）。2026-09-11 以降 Library は 60 件の番号ページネーション**
- 関連: 実装設計書 8.3 / 8.5 / 26 章 / T-206 / T-212 / T-213 / T-216〜T-218、ADR-008 / **ADR-016**
- きっかけ: PWA / 通常ブラウザとも、ギャラリーから記事へ入って戻ると並びが「新しい順」になり先頭から読み直す（2026-09-09）

## 1. 目的

Library ↔ Reader の往復で、**並び・フィルタ・スクロール位置・追加読み込み済みページ**が消えないようにする。そのために読み込みとキャッシュを一箇所の方針に揃える。

今は同じ一覧を **TanStack Query + localStorage、sessionStorage のスクロール、Service Worker の SWR** が別々に覚えており、レイアウトの付け替えで一覧 DOM が毎回消える。対策が重なっても、空白の「読み込み中…」と先頭からの再取得が残る。

## 2. 現状（2026-09-09 時点の実装）

### 2.1 三層が独立している

```
[DOM / スクロール]
  LibraryWorkspace  （(tabs) レイアウト。Reader へ行くとアンマウント）
        │
        ├─ sessionStorage `x-idea.library.scroll`
        │    href / y / sourceId / offset / pageCount
        │
[一覧 JSON]
  QueryClient（root layout で生存）
        └─ persist → localStorage `x-idea.library.v5`
             queryKey[0] === "sources" だけ
        │
[HTTP]
  /api/sources  ← 本番 SW が SWR（200 件、TTL なし）
  /api/media/*  ← SW networkFirst（immutable なのに）
```

設計書 12 章は **persist 先を IndexedDB** と書いてある。実装は `createSyncStoragePersister` + **localStorage**。キーだけ `v5` に上げて schemabuster はない。

### 2.2 データ取得

| 画面 | 取得 | 永続 |
| --- | --- | --- |
| Library | クライアント `useInfiniteQuery` → `GET /api/sources` | TanStack + localStorage |
| Inbox / Today / Reader | RSC + `connection()` | なし（都度サーバー） |
| サムネ | `next/image` `unoptimized` → `/api/media/{id}` | HTTP `private, immutable` + SW networkFirst |

`/api/sources` の **先頭ページだけ** `countSources` + カテゴリ + 情報タイプを同時に取る。cursor 以降は items のみ。1 ページ 30 件。

Library の query オプション:

- key: `["sources", sort, JSON.stringify(filters)]`（**view は含まない。アカウント ID も含まない**）
- `staleTime` 5 分（QueryClient 既定は 15 秒）
- `enabled: !useIsRestoring()`
- `refetchOnMount`: データが無いときだけ
- persist 復元中は query が止まったまま `isPending` → **「読み込み中…」で一覧を消す**

アカウント切替と手動同期は `resetLibraryQueries` で `sources` を捨てる。正しいが、その直後も空白になる。

### 2.3 ナビゲーション

- `(tabs)/layout` と `source/[id]/layout` が別。どちらも TabBar / Dock / AccountSwitcher を持つ。
- Library → Reader で **tabs レイアウトごとアンマウント**。QueryClient だけ残る。
- 戻るリンクは長らく `href="/library"` 固定。2026-09-09 に直近 URL を sessionStorage から読むようにした。
- 戻ったあとのスクロールは 1 回だけ戻す（高さが足りなければ追加ページを待つ）。読み込み中にユーザーがスクロールしたら打ち切る。遅延タイマーの `scrollTo` 連打はしない。
- タブの `<Activity>`（T-213）は未実装。View Transition（`source-{id}`）だけ入っている。

### 2.4 Service Worker（ADR-008 / `x-idea-v4`）

| 対象 | 戦略 | 問題 |
| --- | --- | --- |
| `/api/sources*` | SWR・200 件（localhost は通さない） | 期限なし。古いページが残る |
| navigate `/source/*` | networkFirst・100 件 | HTML と RSC payload の鮮度がズレうる |
| navigate `/library` 他 | networkFirst・上限なし | RUNTIME が膨らむ |
| `/api/media/{id}` | networkFirst | blob は immutable なのに毎回ネットを試す |
| `/api/media/*/file` 他 | bypass | 妥当 |

`PWA_SOURCES_MAX_AGE_MS`（7 日）は定数だけあって SW は使っていない。

### 2.5 実害（再現済み / コード上ほぼ確実）

1. Reader から戻ると一覧 DOM が消え、persist 復元中は「読み込み中…」。ユーザーには **先頭からの再読込** に見える。
2. 戻るリンクが `/library` だと sort / filter が消える。直近修正でも、復元中に Y=0 を書くと位置も消える。
3. localStorage に無限スクロール全ページを直列化している。件数が多いと **quota で persist が黙って失敗**し、リロード後は 1 ページ目だけ。
4. SW の `/api/sources` と TanStack が同じ URL を別Freshness で持つ。アカウント切替後に SW が古い JSON を返しうる。
5. サムネは一覧 remount のたびに再リクエスト。HTTP cache に当たっても **画像の再デコードとレイアウト再計算**が起きる。

## 3. 非目標

- Inbox / Today / Ask を Library と同じクライアント無限スクロールにはしない。
- Serwist への載せ替え（ADR-008 維持）。
- 有料トグルを ON にしない。`user_id` を足さない。全件 SELECT / ベクトルフルスキャンをしない。
- Atlas（P2）の座標キャッシュは対象外。

## 4. 方針（短い順に効く）

優先度は **「消さない」→「小さく覚える」→「保険のキャッシュ」**。

1. **Reader 往復で Library の一覧をアンマウントしない**（本丸）。
2. **persist 復元中も、あるデータを出す**。無いときだけプレースホルダ。
3. **永続化は IndexedDB、直近の visit だけ、buster 付き**。設計書どおり。
4. **SW は HTTP の保険**。TTL を付け、サムネは cache-first。一覧の正は TanStack。
5. sessionStorage スクロールは **フルリロードとプロセスキル用のフォールバック**に落とす。

## 5. 目標アーキテクチャ

### 5.1 レイヤの役割

| レイヤ | 覚えるもの | 捨てるとき |
| --- | --- | --- |
| マウント済み Library（DOM） | スクロール・何ページ目まで出したか | タブを本当に離れたとき / フルリロード |
| TanStack Query（メモリ） | `sources` の pages | アカウント切替・手動同期・sort/filter 変更 |
| IndexedDB persist | 直近 1 visit（最大 8 ページ ≈ 240 件） | 24h / buster / quota |
| sessionStorage | フルリロード用の href + y + sourceId | タブを閉じたとき |
| SW | `/api/sources` は 10 分 SWR、サムネは cache-first | TTL / 件数 |

正本は **メモリの QueryClient**。ディスクと SW はコールドスタート用。

### 5.2 Library を残す（P2、本丸）

採用候補は次の 2 つ。**A を第一候補**とする。

**A. 共通シェル + 並列ルート（推奨）**

```
app/(shell)/layout.tsx     TabBar / Dock / Account を 1 回だけ
  ├─ @tabs/(tabs)/*        Today Inbox Library Videos Ask Settings
  └─ @reader/source/[id]   Reader。開いているときだけ children
```

- Library にいる状態で `/source/:id` へ進んでも `@tabs` の Library は **隠れてもアンマウントしない**（`hidden` または `content-visibility`、`<Activity>` があればそれ）。
- 戻るは `router.back()` または「← ライブラリ」で reader slot を閉じる。スクロール Y はそのまま。
- ディープリンク `/source/:id`（Today / Ask / 通知）では tabs slot に Library がまだ無い。そのときだけ今のフル遷移 + sessionStorage 復元。

**B. `source/[id]` を `(tabs)` 配下に移す（小さい）**

- レイアウトは共有されるが、`page` が Library から Source に差し替わるので **LibraryWorkspace は今と同じく消える**。
- TabBar の二重化は直る。スクロール問題は残る。A の前段としてはよいが、単独では足りない。

**C. モジュールに一覧 DOM を退避**（ポータル / グローバル保持）

- Next のルートモデルと戦いやすい。採用しない。

P2 完了後、`LibraryWorkspace` の 8 段タイマー復元は **フルリロード時だけ**残す。

### 5.3 persist（P1）

- `@tanstack/query-async-storage-persister` + IndexedDB（`idb-keyval` で足りる）。
- key: `x-idea.library.v6`、`buster: "2026-09-11-pages"`（スキーマを変えたら buster だけ上げ、旧 `marginalia.library.v5` / `v6` は起動時に `localStorage.removeItem`）。
- `shouldDehydrateQuery`: 成功した `sources` のみ。**pages は最大 8**。超過は末尾を切る（スクロール復元に必要な `pageCount` と揃える）。
- quota / IDB 失敗は `console` に出さず、Today 相当の静かな失敗（再取得するだけ）。成功フラグをメモリに持ち、失敗時は persist を止める。
- queryKey は `["sources", sort, filters]`。アカウントは入れない（SSR で `anon` になり毎回ミスする）。切替・手動同期は `resetLibraryQueries`。

### 5.4 復元中の UI（P0、先にやる）

`enabled: !restoring` は維持してよい（復元と初回 fetch の競合防止）。ただし:

```
if (restoring && rows.length === 0) → 直前のスケルトン（高さだけ確保）または何も消さない
if (!restoring && isPending && rows.length === 0) → 「読み込み中…」
if (rows.length > 0) → 一覧を出す（isFetching は静かに）
```

ページの Suspense fallback と Workspace の文言を分けない。境界は 1 つ。

`/api/sources` 先頭ページの taxonomy が無くても、件数なしでカードは出してよい。

### 5.5 Service Worker（P0–P1、ADR-008 の範囲内）

- `/api/sources`: SWR のまま、**max-age 10 分**。古いエントリは `PWA_SOURCES_MAX_AGE_MS` を実際に使う（定数は 7 日のままにせず **10 分**に合わせる。オフラインは TanStack/IDB 側）。
- アカウント切替・手動同期のあと `caches.delete(SOURCES)` 相当をクライアントから呼ぶ（`postMessage`）。
- `/api/media/{id}`（`file` 以外）: **cache-first**。サーバーが `immutable` を付けている。
- navigate HTML は今どおり networkFirst。`/library` の RUNTIME 無制限蓄積はやめ、上限 30 件。
- localhost bypass は維持。

### 5.6 スクロール（P2 後に縮小）

P2 前は 2026-09-09 の sessionStorage 実装を残す（戻るリンクの href、Y=0 ロック、`pageCount`）。

P2 後:

- 通常の往復: DOM が残るので **何も復元しない**。
- フルリロード / ディープリンクから「← ライブラリ」: href + sourceId を見て、カードが見えるまで `fetchNextPage` し `scrollIntoView`。Y ピクセル復元は捨ててよい。

## 6. タスク分解（章 35 へ載せる仮 ID）

| ID | 内容 | 依存 | DoD |
| --- | --- | --- | --- |
| T-216 | 復元中に一覧を消さない。Suspense 境界を 1 つに。SW sources に 10 分 TTL。v5 失敗時は捨てる | T-206, T-212 | Reader 往復で「読み込み中…」が一瞬でも出ない（キャッシュあり）。PWA / ブラウザ |
| T-217 | persist を IndexedDB + buster + 最大 8 ページ。queryKey は sort/filters。同期/切替で SW sources を破棄 | T-216 | リロード後も直近 visit のページが残る。タブ再訪で取り直さない |
| T-218 | 共通シェル + Reader 並列ルート（5.2A）。往復では Library をアンマウントしない。scroll 復元をフォールバック化 | T-216, T-213 の Activity と同時でも可 | ギャラリー途中 → 記事 → 戻るで **ピクセル単位で同じ位置**。並びは URL のまま |

T-213（Activity + Instant Navigations）はタブ同士の話。T-218 は Library↔Reader。両方必要で、**T-218 の方が今回のバグに効く**。

## 7. 受け入れ

- ギャラリーを 2 ページ以上スクロールし、カードを開き、戻る。並びも位置も同じ。PWA と通常ブラウザ。
- フルリロード後も、直近の sort/filter と「開いたカード付近」に戻れる（フォールバック）。
- アカウント切替後に前アカウントの一覧が一瞬も出ない。
- persist / SW が壊れても一覧はネットワークから出る（空白のまま止まらない）。
- `/api/sources` は従来どおり LIMIT。フルスキャンしない。

## 8. リスク

| リスク | 避け方 |
| --- | --- |
| 並列ルートで Today 起点の Reader と Library 起点の戻りが混線 | ディープリンクはフル Reader。Library 起点だけ slot を使う、と明示 |
| IndexedDB が Safari / iOS PWA で消える（7 日） | 設計書どおり。SW + ネットワークを保険にする |
| View Transition と隠した Library の相性 | 共有要素はヒーローだけ。一覧側は残した DOM の同じノードを使う |
| 8 ページ制限で深い位置が復元できない | P2 後は DOM が残るので制限はコールドスタートだけ |

## 9. 本体設計書との差分（採用時に直す）

- 12 章「IndexedDB 永続化」→ 実装が追いつくまで本ドキュメントを正とする。T-217 で一致。
- 8.3「追加読み込み済みページは往復後も保持」→ **DOM を残す**のが第一。persist は保険。
- 26 章 `partialPrefetching: true` → Next 16.3.4 では未設定（ADR-001）。T-213 で再確認。
- 26 章 SW「7 日」と `PWA_SOURCES_MAX_AGE_MS` → 一覧 API は **10 分**。オフラインの「直近閲覧」は Reader HTML + IDB の sources。
