# ADR-016: Library の読み込みは「消さない」を正とし、persist / SW は保険にする

- 日付: 2026-09-09
- 状態: 採用
- 関連: 実装設計書 8.3 / 8.5 / 26 章 / T-216〜T-218、ADR-008、`docs/design/2026-09-09-library-load-cache.md`

## 文脈

Library と Reader が別レイアウトだったため、記事を開くたびに一覧 DOM が消えた。TanStack Query の localStorage persist、sessionStorage のスクロール、Service Worker の SWR が同じ一覧を別々に覚え、復元中は「読み込み中…」で先頭から読み直したように見えた。

## 決定

1. **Reader は `(tabs)` の並列ルート `@reader/(.)source/[id]` で割り込む。** Library 起点の往復では一覧をアンマウントしない。ディープリンク / リロードは従来の `/source/[id]`。
2. **一覧 JSON の persist は IndexedDB**（`x-idea.library.v6`、buster `2026-09-11-pages`、最大 8 ページ）。旧 `marginalia.library.v5` / `v6` は起動時に捨てる。queryKey は `["sources", sort, filters]`。アカウントはキーに入れない（切替時は `resetLibraryQueries`）。SSR ハイドレーションで `anon → 実ID` とキーが変わって毎回取り直すのを避ける。件数が残っているのに `nextCursor` が無い壊れた persist は保存せず、マウント時に取り直す。
3. **SW の `/api/sources` は 10 分 TTL。** サムネは cache-first。アカウント切替と手動同期で sources キャッシュを捨てる。
4. sessionStorage のスクロール復元は、フルリロードと「隠した一覧を再表示したとき」のフォールバックに残す。

## 影響

- TabBar / Dock は `AppChrome` に寄せる。intercept 中は tabs 側の children を `hidden` にして Reader を出す。
- 設計書 12 章の IndexedDB 記述と実装が一致する。
- Serwist は使わない（ADR-008 維持）。バージョンは `x-idea-v4`。
