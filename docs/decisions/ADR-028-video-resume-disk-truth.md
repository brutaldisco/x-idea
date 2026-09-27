# ADR-028: 動画再開のディスク正本と finalize 分離

- 日付: 2026-09-27
- 状態: 採用
- 関連: ADR-007、ADR-021、ADR-023、ADR-025、ADR-026、設計書 8 章（SC-15）/ 14.6

## 文脈

大容量動画は tail サイドカー（ADR-026）で途中まで保存できても、
ウォッチドッグ上限・タブ終了・結合前の `complete` 失敗などで
`failed` のまま残ることがある。進捗は IndexedDB・`progress_bytes`・
本体 + `.part` に分散しており、UI と実ディスクがずれる。

手動で Node から tail だけ Range 取得→結合→DB `ready` にした事例では、
**ネットワークは足りない分だけ**、**再開位置はディスク**、
**結合と台帳更新を分離**するのが有効だった。

## 決定

1. **`reconcileLocalVideoState`（純関数）**  
   本体サイズ・`.part` サイズ・`ftyp`・total ヒントから
   `complete-only` / `merge-only` / `fetch-tail` / `fresh` を決める。
   受信済みバイトの正本は `max(DB/IDB, main + part)`。

2. **`downloadVideoFile` 入口**  
   再開時に必ず reconcile する。`complete-only` はネットワークなしで
   `verifying` フェーズのあと完了。`merge-only` は既存サイドカー経路で
   tail 取得をスキップして結合のみ。

3. **失敗時のサーバー進捗**  
   `fail` API は `received` / `total` を受け取り、
   `progress_bytes` / `progress_total` を COALESCE 更新する。
   クライアントは fail 直前に `measureLocalVideoProgress` で
   ディスク上の方が大きければそれを送る。

4. **ウォッチドッグ**  
   残り比率が小さい・256MB 超の途中ファイルほど再試行上限を増やす。
   再試行間は指数バックオフ。`opening` / `merging` / `verifying` では
   無音切断しない（既存方針の拡張）。

5. **failed の控えめ自動再開**  
   Videos タブを開き、保存フォルダ許可済みのとき、
   `progress_bytes > 0` かつ 404 以外の `failed` を
   セッション 1 回だけ「すべて開始」相当で再開する。

6. **結合**  
   サイドカーは 32MB チャンクで本体へ書き込み、
   巨大 `.part` を一度にメモリへ載せない。

7. **ローカル CLI（任意）**  
   `pnpm video:resume`（`VIDEO_LOCAL_ROOT` + Turso）で
   ブラウザ外から tail→結合→`ready`。タブが使えないときの最後の手段。

## 影響

- 89% 付近で止まった `failed` も、再試行で tail のみ取得→結合しやすくなる。
- 取り切り済みで DB だけ `failed` の行は即 `ready` にできる。
- サーバーはユーザーディスクに触れない。CLI は開発者・自己ホスト用途。
