# ADR-010: AI 呼び出しは AI SDK 7 + レーン予算ガード

- 日付: 2026-09-06
- 状態: 採用
- 関連: 設計書 16.2 / 16.3 / T-201、付録F

## 文脈

T-201 は AI SDK 6 を指定していた。着手時点の npm 最新は `ai@7` と `@ai-sdk/google@4`。`generateText` + `Output.object`、`ToolLoopAgent` は 7 でも同じ入口。設計書の「着手時に最新パッチ」に合わせる。

## 決定

- 依存は **`ai` 7** と **`@ai-sdk/google` 4**。構造化出力は `generateObject` ではなく `generateText({ output: Output.object({ schema }) })`。
- すべての AI 呼び出しは `budget.guard(lane)`（`withLaneCall`）経由。429 では `ai_paid_enabled` を触らない。
- 日次キーは太平洋時間の日付。PerDay クォータの 429 は次の PT 0:00 までクールダウン。それ以外の 429 は `60s * (1 + jitter)`。
- レーン起因のジョブ失敗は `attempts` を増やさず `run_after` だけずらす。

## 影響

- 設計書 13.1 / T-201 の「AI SDK 6」表記を 7 に合わせる。Ask の `ToolLoopAgent` は後続タスクで同じパッケージを使う。
