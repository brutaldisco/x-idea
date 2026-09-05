# ADR-008: Chrome 向け PWA はルートの `/sw.js` で入れる

- 日付: 2026-09-06
- 状態: 採用
- 関連: 設計書 26 章 / T-212、A-17

## 文脈

設計書は Service Worker に Serwist を指定している。一方で Next.js 16.3 は `next dev` / `next build` とも Turbopack が既定で、`@serwist/next` の webpack プラグインとは噛み合わない。`@serwist/turbopack` は別系統で、ビルドと Vercel Hobby への追加依存が大きい。

ユーザー要求の本丸は **Chrome でインストールできる Web アプリ化** である。Chrome のインストール条件は、HTTPS（または localhost）、マニフェスト（name / 192・512 アイコン / start_url / display）、`fetch` ハンドラ付き Service Worker である。

## 決定

- マニフェストは `src/app/manifest.ts`（`/manifest.webmanifest`）。`display: standalone`、`start_url: /today`、maskable アイコン、`share_target` を含める。
- Service Worker は `public/sw.js`。App Shell と静的資産、`/api/sources*` の Stale-While-Revalidate（200 件）、Reader（`/source/*`）直近 100 件、オフライン時は `/offline`。
- 大きな動画 Range と同期・ジョブ・OAuth・MCP は SW を通さない。
- インストール案内は Settings / オンボーディング / `beforeinstallprompt` のバー。
- Serwist は使わない。キャッシュ戦略を後で差し替える余地は残す。

## 影響

- Lighthouse PWA の「SW + マニフェスト」は満たせる。機内モードで読めるのは、一度開いたページとプリキャッシュした `/offline` に限る。
- `APP_PASSCODE` 時も `/sw.js`・マニフェスト・アイコン・`/offline` は公開する。本体ページは従来どおりゲートする。
- iOS は共有シートからの「ホーム画面に追加」案内のみ（`beforeinstallprompt` なし）。
