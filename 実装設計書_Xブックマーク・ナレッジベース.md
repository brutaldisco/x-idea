# 実装設計書：Marginalia — Xブックマーク・パーソナルナレッジベース

| 項目 | 内容 |
| --- | --- |
| ドキュメント種別 | 実装設計書（Implementation Design Document） |
| 対象読者 | 実装担当AI（worker AI）／エンジニア |
| 版 | **v3.2** |
| 作成日 | 2026-07-12 |
| 改訂日 | **2026-09-05** |
| ステータス | 実装着手可能 |
| 外部サービス情報の確認日 | 2026-09-04（Next.js / Turso / Gemini / X API / Vercel / AI SDK / MCP の各公式ドキュメント） |
| リポジトリ | `https://github.com/brutaldisco/x-idea.git`（空。本書のコミットから開始） |
| 本番URL | **`https://x-idea.vercel.app`**（Vercel Hobby、リージョン `hnd1`） |
| 本番DB | Turso libSQL `libsql://x-idea-brutaldisco.aws-ap-northeast-1.turso.io`（東京リージョン） |
| 旧版 | `docs/archive/実装設計書_v2.0_2026-08-11.md` |

> **本書の読み方**
> 本書は、追加の大きな設計判断なしに開発へ着手できることを目標に書かれている。各章で「採用」「代替案」「トレードオフ」を明示する。曖昧な箇所は止まらずに進められるよう **[仮定]** タグで合理的な仮定を明記した（一覧は付録A）。worker AI は **付録F「worker AI 向け実装ガイド」** と **35章「実装タスク分解」** から着手すること。
>
> **v3.0 の要点（v2.0 からの変更）**
> 1. **技術スタックを 2026-09 時点の最新に刷新**：Next.js 16.3（Cache Components / Instant Navigations / `proxy.ts`）、React 19.2（`<ViewTransition>` / `<Activity>`）、Tailwind CSS v4、shadcn/ui、AI SDK 6（`ToolLoopAgent` / `Output.object` / 生成UI）、Drizzle ORM 1.0、Zod 4、Turso libSQL（ネイティブ vector + DiskANN、FTS5 trigram）。
> 2. **Gemini 無料枠の激減に対応**：2026-09 実測で Flash 系は **20 リクエスト/日**、Flash-Lite は **500/日**、Embedding 2 は **1,000/日**。→ 「AI予算（AI Budget）」を第一級の設計概念にし、**レーン別モデルルーティング**・**バッチenrich**・**日次クォータ管理**を導入。インフラ/AI $0 の原則は維持。
> 3. **「驚き」を生む体験を追加**：朝の **Daily Briefing**（音声つき）、引用と生成UIつきの **Ask**、知識の星図 **Atlas**、忘却に逆らう **Echo**、AIが余白に書き込む **Marginalia Reader**、スクショの文字まで検索できる **マルチモーダル取り込み**、自分の知識を Claude / ChatGPT / Cursor から使える **MCPサーバー**、Xの **ブックマークフォルダ連動**、自然言語で作る **Lens（スマートコレクション）**、ユーザー修正から学ぶ **「学習する司書」**。
> 4. **個人用途・シングルテナント・アプリログインなし** は維持。ただし外部から機械アクセスする経路（MCP / Quick Capture / Cron）には **Bearer トークン必須**。任意で `APP_PASSCODE`。
> 5. **リポジトリと本番DB・本番URLを確定**：GitHub `brutaldisco/x-idea`、Turso 東京、Vercel `https://x-idea.vercel.app`（`hnd1`）。有料プランはすべて **設定トグル既定 OFF**。契約が遅れても実装は `MOCK_EXTERNAL=1` と無料枠で進められる（付録H）。

> **v3.2 の要点（v3.1 からの変更）**
> 1. **X 連携を複数アカウント（最大 3）に変更**（ADR-002）。`x_account` は複数行になり、`sources` は `x_account_id` でどのアカウント由来かを保持する。同期カーソルはアカウント別に分離する。アプリのユーザー概念やログインは追加しない。

---

## 目次

0. [v2.0 → v3.0 変更サマリー](#0-v20--v30-変更サマリー)
1. [プロダクト概要](#1-プロダクト概要)
2. [目的と成功条件](#2-目的と成功条件)
3. [想定ユーザーと利用シナリオ](#3-想定ユーザーと利用シナリオ)
4. [機能一覧](#4-機能一覧)
5. [MVPの範囲](#5-mvpの範囲)
6. [MVPに含めない範囲](#6-mvpに含めない範囲)
7. [体験設計の原則](#7-体験設計の原則)
8. [画面構成と画面別仕様](#8-画面構成と画面別仕様)
9. [画面遷移](#9-画面遷移)
10. [デザインシステム](#10-デザインシステム)
11. [主要操作フロー](#11-主要操作フロー)
12. [システム構成図](#12-システム構成図)
13. [技術スタック（2026-09 版）](#13-技術スタック2026-09-版)
14. [X連携方式](#14-x連携方式)
15. [記事取得方式](#15-記事取得方式)
16. [AI処理設計（AI予算とモデルルーティング）](#16-ai処理設計ai予算とモデルルーティング)
17. [バックグラウンドジョブ設計](#17-バックグラウンドジョブ設計)
18. [データモデル](#18-データモデル)
19. [テーブル定義（DDL）](#19-テーブル定義ddl)
20. [エンティティ間の関係](#20-エンティティ間の関係)
21. [API設計](#21-api設計)
22. [検索設計](#22-検索設計)
23. [Knowledge Card 生成方式](#23-knowledge-card-生成方式)
24. [Briefing / Echo / Insights 仕様](#24-briefing--echo--insights-仕様)
25. [MCPサーバー仕様](#25-mcpサーバー仕様)
26. [PWA・オフライン・プッシュ通知](#26-pwaオフラインプッシュ通知)
27. [エラー処理](#27-エラー処理)
28. [運用上の注意（セキュリティ最小）](#28-運用上の注意セキュリティ最小)
29. [プライバシー設計](#29-プライバシー設計)
30. [非機能要件](#30-非機能要件)
31. [テスト方針](#31-テスト方針)
32. [監視とログ](#32-監視とログ)
33. [コスト概算](#33-コスト概算)
34. [開発フェーズ](#34-開発フェーズ)
35. [実装タスク分解（worker AI 向け）](#35-実装タスク分解worker-ai-向け)
36. [受け入れ条件](#36-受け入れ条件)
37. [リスクと未確定事項](#37-リスクと未確定事項)
38. [将来拡張](#38-将来拡張)
- [付録A：仮定一覧](#付録a仮定一覧)
- [付録B：AIプロンプト設計](#付録baiプロンプト設計)
- [付録C：フリーミアム枠の前提（2026-09 実測）](#付録cフリーミアム枠の前提2026-09-実測)
- [付録D：環境変数一覧](#付録d環境変数一覧)
- [付録E：リポジトリ構成](#付録eリポジトリ構成)
- [付録F：worker AI 向け実装ガイド](#付録fworker-ai-向け実装ガイド)
- [付録G：用語集](#付録g用語集)
- [付録H：アカウント・契約チェックリスト](#付録hアカウント契約チェックリスト)

---

## 0. v2.0 → v3.0 変更サマリー

| 領域 | v2.0 | v3.0 | 理由 |
| --- | --- | --- | --- |
| フレームワーク | Next.js 15+ | **Next.js 16.3**（Turbopack 既定、Cache Components、Instant Navigations、`proxy.ts`） | SPA並みの即時ナビゲーションをRSCのまま実現。2026-08 セキュリティリリース済みの Active LTS |
| React | 19 | **19.2**（`<ViewTransition>`、`<Activity>`、`useEffectEvent`、React Compiler） | カード→詳細の共有要素アニメーション、タブ状態保持 |
| CSS / UI | Tailwind 3 + shadcn/ui | **Tailwind v4**（CSS-first 設定、OKLCH）+ shadcn/ui 最新 | デザイントークンをCSS変数で一元管理 |
| AI SDK | 直接fetch | **AI SDK 6**（`@ai-sdk/google`、`ToolLoopAgent`、`Output.object`、`useChat` 生成UI、MCPクライアント） | 構造化出力・ストリーミング・エージェントの定番化 |
| Gemini モデル | 2.5 Flash-Lite 単一 | **レーン別ルーティング**：bulk = `gemini-3.5-flash-lite`、quality = `gemini-3.6-flash`、embed = `gemini-embedding-2`（768次元） | 無料枠が Flash 20/日・Lite 500/日・Embedding 1,000/日に縮小（2026-09 実測） |
| AI 処理量 | 1 Source = 1 呼び出し | **バッチenrich（最大5件/呼び出し）**＋**AI予算テーブル**＋クォータ検知で自動先送り | 初回5,000件でも枠内で数日で完了 |
| マルチモーダル | P3 | **P2 で標準化**：画像OCR/説明を同じenrich呼び出しで取得、画像もベクトル化 | Flash-Lite / Embedding 2 がネイティブ対応。スクショ投稿の検索性が激変 |
| ORM | Drizzle 0.x | **Drizzle ORM 1.0**（`@libsql/client`） | 1.0 系で libSQL/Turso ドライバ整備 |
| 全文検索 | unicode61 + アプリ側バイグラム | **FTS5 `trigram` トークナイザ**＋短語 LIKE フォールバック | 日本語に対する検索漏れを削減、実装が単純 |
| ベクトル | 「Turso vector（実装時確定）」 | **`F32_BLOB(768)` + `libsql_vector_idx`（DiskANN、`compress_neighbors=float1bit`, `max_neighbors=32`）+ `vector_top_k`** | rows read と容量を抑えた具体構成 |
| ジョブ | jobs テーブル + 外部Cron | 同方式を維持 ＋ `after()` による即時キック ＋ `job_schedules` テーブル ＋ アプリ起動時 tick | Vercel Hobby の Cron は日次のみ。Workflows は Hobby 5万イベント/月で上限到達時30日停止のため主系にしない |
| 画面 | 9 画面 | **14 画面**（Today / Inbox / Library+Atlas / Ask / Settings ＋ Reader, KC, Briefing, Echo, Capture, Onboarding, Sync, Categories&Lens） | 「開いた瞬間に価値がある」体験へ |
| 外部連携 | なし | **MCPサーバー**（`mcp-handler` 2.x、Bearer認証）、**Quick Capture**（iOSショートカット / Android Share Target）、**Web Push** | 自分の知識をAIエージェントの記憶にする |
| X連携 | bookmarks のみ | ＋ **ブックマークフォルダ**同期（フォルダ→カテゴリ写像）、**スレッド展開**（P2、コスト上限つき） | Owned Reads $0.001/リソース（2026-04-20 改定） |
| 認証 | なし（任意 APP_PASSWORD） | UIはなし／**機械アクセスは Bearer 必須**／任意 `APP_PASSCODE`（`proxy.ts`） | MCP 公開に伴う最小限の抑止 |
| リージョン | 未指定 | **Vercel `hnd1` × Turso `aws-ap-northeast-1`** | DBラウンドトリップ最小化 |

---

## 1. プロダクト概要

**Marginalia** は、X でブックマークした投稿を自動的に収集し、AI が要約・分類・タグ付け・関連付け・画像解読を行い、「保存して終わり」ではなく **「必要なときに引き出せる」「勝手に思い出させてくれる」「自分のAIエージェントの記憶になる」** 個人用ナレッジデータベースである。名前の由来は「本の余白に書き込むメモ（marginalia）」。原文は書き換えず、AIと自分のメモを **余白** に書き込むという思想を UI にも反映する。

コアコンセプト（4原則）：

1. **ユーザーの操作は X でのブックマークだけ。** 収集・解析・整理は全自動。ユーザーが能動的に行うのは「確認・修正・活用」のみ。
2. **原文（Source）と自分の知識（Knowledge Card）の分離。** 一次情報と、それを自分の言葉で整理した知識を、データ構造・UI の両面で明確に区別する。
3. **AI は提案者、人間は決定者。** AI 判定は確信度つきで保存。高確信は自動確定、低確信は Inbox で少数候補を提示。人間の修正は常に AI の再処理より優先され、**修正は AI の次の判断材料になる**（学習する司書）。
4. **知識は引き出されなければ存在しないのと同じ。** 検索・質問だけでなく、朝の Briefing、Echo（再浮上）、Insights（週次の気づき）、MCP（外部AIからの参照）によって、システム側から知識を **押し出す**。

対象はモバイルファーストのレスポンシブ Web アプリ（PWA）。**本人1人だけのシングルテナント**。マルチユーザー・公開SaaS化は将来拡張にも含めない。

---

## 2. 目的と成功条件

### 2.1 目的

- X のブックマークが「読み返されない墓場」になる問題を解消する。
- 学習テーマ（社会学、AI、仕事、筋力トレーニングなど）ごとに知識が自動で蓄積・整理される状態を作る。
- 保存済みの情報に対して検索・質問・再利用ができ、複数の情報源から自分の知識（Knowledge Card）を構築できる。
- 自分の知識を **他の AI ツール（Claude / ChatGPT / Cursor）からも参照できる** ようにする。
- **月額インフラ／AI 費用を原則ゼロ** にし、フリーミアム枠内で運用を完結させる。有料になり得るのは X API（従量）のみ。

### 2.2 成功条件

| # | 成功条件 | 測定方法 | 目標値 |
| --- | --- | --- | --- |
| S1 | ブックマークが自動で取り込まれる | 同期成功率（直近30日） | 99%以上 |
| S2 | ブックマーク→アプリ反映の遅延 | 同期間隔＋処理時間 | 60分以内（既定の同期間隔30分） |
| S3 | AI 分類の自動確定率 | 自動確定数÷全取り込み数 | 70%以上（運用3か月後）、**85%以上（6か月後・学習する司書の効果）** |
| S4 | AI 分類の修正率 | ユーザー修正数÷自動確定数 | 20%以下 |
| S5 | 保存情報が実際に引き出されている | 検索・Ask・Source閲覧・MCP呼び出しの週次回数 | 週10回以上 |
| S6 | 運用コスト | インフラ＋AI $0、X API のみ従量 | X API **月 $5 以下**（通常運用） |
| S7 | Inbox 処理負担 | 要確認1件あたり処理時間 | 8秒以内（スワイプ／1タップ） |
| S8 | フリーミアム枠内運用 | Turso / Vercel / Gemini の枠超過 | 月次で超過なし（AI は日次クォータで自動抑制） |
| S9 | Briefing の定着 | 朝の Briefing を開いた日数÷配信日数（直近30日） | 60%以上 |
| S10 | 忘却への抵抗 | Echo で「覚えていた／有用」評価の割合 | 50%以上 |
| S11 | 体感速度 | 主要タブ間ナビゲーションが instant（Next.js `instant()` テスト） | 全タブ pass |

S3/S4/S9/S10 はリリース後のチューニング指標であり、リリースブロッカーではない。

---

## 3. 想定ユーザーと利用シナリオ

### 3.1 想定ユーザー

- 本人（単一ユーザー）。X を日常的に閲覧し、社会学・AI・組織・デザイン・筋力トレーニング・健康・仕事・思想などの投稿を1日数件〜数十件ブックマークする。
- スマートフォン（iOS 主）での利用が主。PC では検索・KC 編集・Atlas 探索などの「じっくり作業」を行う。
- Claude / ChatGPT / Cursor などの AI ツールを日常的に使い、「自分の保存情報を踏まえて答えてほしい」ニーズがある。
- **[仮定]** 取り込み量は平均20件/日、ピーク50件/日、年間約7,000〜18,000件。初回取り込みは既存ブックマーク最大 5,000 件。

### 3.2 利用シナリオ

**シナリオ1：日常の収集（操作ゼロ）**
通勤中に X でブルデューの文化資本に関する投稿と、AI エージェント設計の記事リンクつき投稿と、英語論文のスクリーンショットだけの投稿をブックマークする。30分後にアプリが自動同期し、本文・リンク先記事・**画像内の文字**を取得。AI が要約・分類（社会学/理論、AI/方法）・タグ付けを行い、高確信のためライブラリへ自動確定。ユーザーは何もしない。

**シナリオ2：朝の Briefing（3分）**
朝7時半、PWA からプッシュ「今日の Briefing ができました」。開くと「昨日保存した6件の要点」「3か月前に保存した投稿と矛盾する主張が1件」「今週あなたが追っているテーマ：注意の経済」が1画面に。再生ボタンで音声読み上げ（端末の音声合成、無料）を聞きながら支度をする。

**シナリオ3：すきま時間の Inbox（1〜2分）**
昼休みに Inbox を開く。AI が迷った2件だけが表示され、それぞれ「なぜ迷ったか」の一行と候補カテゴリ3つが提示されている。1タップで確定、1件は左スワイプでアーカイブ。修正内容は次回以降の分類の参考例として自動的に蓄積される。

**シナリオ4：Ask（引き出す）**
週末、筋トレメニューを組み直すため Ask に「週3回の分割法で初心者向けの推奨は？」と（音声で）質問。保存情報だけを根拠に、根拠となる Source カードがインラインで並んだ回答がストリーミング表示される。「まだ実践していないものだけ」と続けて絞る。回答を Knowledge Card として保存する。

**シナリオ5：Claude から自分の知識を使う**
Claude Desktop に Marginalia の MCP サーバーを接続済み。「私が保存した『組織のフラット化』に関する情報を踏まえて、来週の社内提案の論点を整理して」と頼むと、Claude が `search_knowledge` ツールで自分のブックマークを検索し、出典つきで論点を組み立てる。

**シナリオ6：Echo（忘却に逆らう）**
夜、Today 画面の Echo カードが「4か月前に保存した『タンパク質は体重×1.6g』という主張、今も同意しますか？」と問う。「同意」「変わった」「もう不要」のいずれかを1タップ。「変わった」を選ぶと、関連する新しい Source が提示され、KC の更新を提案される。

**シナリオ7：Atlas（俯瞰する）**
PC でライブラリを Atlas 表示に切り替える。埋め込みから自動生成されたクラスタが星図のように広がり、「AIエージェント設計」と「組織論」の間に橋渡しになる Source が数件浮いている。タイムスライダーを動かすと、興味の重心が半年でどう移ったかが見える。

**シナリオ8：Knowledge Card の構築**
「AI エージェントのモデル分担」について保存した5件の Source を選び、AI ドラフト（タイトル、一文要約、重要ポイント、主張と根拠、注意点）を生成。「自分にとっての意味」「次に試すこと」を自分の言葉で追記して保存。AI 部分と自分の記述は UI 上で明確に区別される。

---

## 4. 機能一覧

優先度：**P1 = MVP**、P2 = 知識化フェーズ、P3 = 将来。

| ID | 機能 | 概要 | 優先度 |
| --- | --- | --- | --- |
| F-02 | X アカウント連携 | OAuth 2.0 PKCE。トークンをサーバー側保管・自動更新 | P1 |
| F-03 | ブックマーク自動同期 | 定期ポーリング差分取得、重複排除、状態管理 | P1 |
| F-04 | 手動同期 | 「今すぐ同期」。60秒スロットリング | P1 |
| F-05 | X 投稿保存 | 本文・投稿者・日時・URL・リンク・引用・メディア情報 | P1 |
| F-06 | 外部記事取得 | 投稿内リンク先のメタデータ・本文（合法的範囲） | P1 |
| F-07 | AI 要約 | 投稿・記事の要約（原文と分離保存） | P1 |
| F-08 | AI 分類・タグ付け | カテゴリ・情報タイプ・タグ・重要度。確信度つき。**バッチ処理** | P1 |
| F-09 | Inbox（トリアージ） | 要確認のみ提示。スワイプ／1タップ。**AI の迷い理由表示・Undo・一括確定** | P1 |
| F-10 | ライブラリ | カテゴリ・情報タイプ・状態・タグで閲覧・絞り込み。リスト／グリッド | P1 |
| F-11 | Source 詳細（Reader） | 原文・記事・要約の統合表示、分類編集、メモ、状態変更 | P1 |
| F-12 | キーワード検索 | FTS5 trigram。本文・要約・タグ・メモ・**画像内テキスト** | P1 |
| F-13 | カテゴリ管理 | 階層カテゴリの追加・変更・統合 | P1 |
| F-14 | 同期・ジョブ状況 | 同期履歴・失敗理由・再試行・**AI予算メーター** | P1 |
| F-15 | 設定 | 同期間隔、返信の扱い、しきい値、AI レーン設定、除外ドメイン | P1 |
| F-22 | メディア基本対応 | メディア有無、サムネイル、alt | P1 |
| F-24 | **Today（ホーム）** | Briefing・Inbox件数・Echo・Insights・最近・同期状態を1画面に | P1 |
| F-25 | **AI予算管理** | レーン別日次クォータ追跡、429 検知で自動先送り、メーター表示 | P1 |
| F-26 | **学習する司書** | ユーザー修正を `feedback_examples` に蓄積し、類似例を enrich プロンプトに few-shot 注入 | P1（蓄積）／P2（注入） |
| F-27 | **Onboarding** | X連携→フォルダ選択→初回取り込み規模選択→PWA インストール案内→通知許可 | P1 |
| F-28 | **X ブックマークフォルダ連動** | フォルダ一覧取得、フォルダ→カテゴリ写像、日次同期 | P2 |
| F-16 | Knowledge Card | 複数 Source からの KC 作成・編集・AI ドラフト | P2 |
| F-17 | 意味検索・ハイブリッド | Embedding 2 + Turso vector、RRF 統合 | P2 |
| F-18 | **Ask（RAG）** | 保存情報を根拠に回答。出典明示、生成UIで Source カードをインライン表示、音声入力、追質問 | P2 |
| F-19 | 重複・関連・矛盾検出 | 類似度＋LLM 二次判定 | P2 |
| F-29 | **Daily Briefing** | 毎朝の要点・矛盾・テーマ動向を1本の Briefing に。端末音声合成で読み上げ。プッシュ通知 | P2 |
| F-30 | **Echo（再浮上）** | 間隔反復スケジュールで古い Source/KC を問いとして再提示。反応を記録 | P2 |
| F-31 | **Insights（週次の気づき）** | 週次で新興テーマ・橋渡し Source・放置テーマを生成 | P2 |
| F-32 | **Marginalia Reader** | AI が本文の重要文を余白にハイライト・注釈。ユーザーのハイライト保存。選択範囲について質問 | P2 |
| F-33 | **マルチモーダル取り込み** | 画像 OCR／説明を enrich に統合。画像ベクトル化で「見た記憶」から検索 | P2 |
| F-34 | **Lens（スマートコレクション）** | 自然言語条件（例「初心者向けの筋トレ」）＋フィルタで自動更新される仮想コレクション | P2 |
| F-35 | **Atlas（知識星図）** | 埋め込みクラスタの2D俯瞰、クラスタ自動命名、タイムスライダー | P2 |
| F-36 | **MCP サーバー** | 検索・取得・メモ追加・KC作成ツールを MCP で公開。Bearer 認証 | P2 |
| F-37 | **Quick Capture** | 任意 URL／テキストを iOS ショートカット・Android 共有から取り込み（`origin='manual'`） | P2 |
| F-38 | **Web Push / Badging** | Briefing 完成・Inbox 件数・再認証要求を通知。アイコンバッジ | P2 |
| F-39 | **スレッド展開** | ブックマーク投稿が起点のセルフスレッドを取得（7日以内、上限・コスト上限つき） | P2 |
| F-20 | 定期レビュー | 古くなった可能性・未読の掘り起こし（Insights に統合） | P2 |
| F-21 | エクスポート | Markdown（Obsidian 互換）／JSON | P2 |
| F-40 | コマンドパレット | PC で ⌘K。検索・移動・状態変更・自然言語コマンド | P2 |
| F-23 | 動画文字起こし等 | 動画音声の書き起こし・チャプター | P3 |
| F-41 | MCP OAuth | ChatGPT / Claude.ai Web など OAuth 必須クライアント向けの認可サーバー連携 | P3 |
| F-01 | （廃止）アプリ認証 | ログイン画面・ユーザー登録は持たない | — |

---

## 5. MVPの範囲

MVP（P1）は「**X でブックマークするだけで、要約・分類済みの情報が Today と Inbox とライブラリに現れ、キーワードで検索でき、AI 予算内で自動運転する**」を成立させる最小構成。

含まれるもの：

- X 連携（F-02）、Onboarding（F-27）。アプリログインは無し
- 同期：定期（既定30分）＋手動、差分取得、重複防止、削除・非公開の状態管理（F-03/F-04）
- X 投稿の保存：本文、投稿者、日時、URL、リンク、引用（1階層）、メディア基本情報（F-05/F-22）
- 外部記事の取得（F-06）
- AI 処理：要約、カテゴリ、タグ、情報タイプ、重要度。**バッチ enrich**、確信度分岐、**AI 予算管理**（F-07/F-08/F-25）
- ユーザー修正の蓄積（F-26 蓄積側）
- Today、Inbox、ライブラリ、Reader（基本）、キーワード検索、カテゴリ管理、同期状況、設定（F-24/F-09〜F-15）
- モバイルファースト＋PWA（ホーム画面追加、基本オフライン閲覧）。Instant Navigations 対応
- MVP 時点で **P2 のためのスキーマ（ベクトル列、feedback_examples、briefings 等）を先に作成**しておく

MVP の完成条件は 36 章。

## 6. MVPに含めない範囲

| 項目 | 除外理由 | 拡張余地 |
| --- | --- | --- |
| アプリ認証・マルチユーザー | 個人用途 | `user_id` 列は持たない |
| Ask / 意味検索 / Briefing / Echo / Insights / Atlas / Lens / MCP / Push / KC | 埋め込み基盤と蓄積データが前提 | スキーマは MVP で作成済み。P2 で有効化 |
| スレッド展開 | 追加コスト（$0.005/投稿） | `x_posts.thread_root_id` を確保 |
| 動画文字起こし | 無料枠に収まらない | `media_assets.analysis_json` を確保 |
| 返信スレッド（他者）の収集 | 要件で対象外 | — |
| MCP OAuth（ChatGPT 等） | 認可サーバーが別途必要 | `mcp-handler` の `protectedResourceHandler` で後付け可 |
| X 以外の自動収集（RSS 等） | スコープ外 | `sources.origin` |
| Obsidian 相当のグラフ編集・双方向リンク | 差別化ではない | Markdown エクスポート |

---

## 7. 体験設計の原則

UI/UX の判断に迷ったら以下に従う。

| # | 原則 | 具体 |
| --- | --- | --- |
| U1 | **開いた瞬間に価値** | Today は「今日読むべき1つ」を最上部に。空状態でも次の行動が1タップで分かる |
| U2 | **ゼロ操作を守る** | 入力を求めるのは Inbox（迷い分のみ）と Echo（1タップ）だけ。それ以外は閲覧で完結 |
| U3 | **AI は余白に書く** | AI 生成物は必ず「✦ AI」バッジ＋専用ハイライト色。原文とユーザー記述を侵食しない。AI の判断には「なぜ」を一行添える |
| U4 | **片手・親指帯** | 主要 CTA は下部 96px 帯。タップ領域 44px 以上。スワイプ閾値は幅の 35% |
| U5 | **instant** | タブ間・一覧→詳細は即時（App Shell を Partial Prefetching、`use cache`）。詳細はサムネ→ヒーローの `<ViewTransition>` 共有要素 |
| U6 | **取り消せる** | 破壊的でない操作は即時反映＋5秒 Undo トースト。破壊的操作は確認文字列 |
| U7 | **状態が見える** | 同期・AI 処理・予算残量は Today の1つのピルに集約。詳細は Sync 画面 |
| U8 | **日本語が美しい** | `font-feature-settings: "palt"`、`line-break: strict`、`text-wrap: pretty`、和欧混植の余白 |
| U9 | **静けさ** | 装飾より情報密度。アニメーションは 200〜320ms、`prefers-reduced-motion` を尊重 |
| U10 | **驚きは1画面に1つ** | Briefing・Atlas・Echo などの「驚き」機能は主張しすぎない。日常の導線に自然に置く |

---

## 8. 画面構成と画面別仕様

下部タブは5項目固定：**Today / Inbox / Library / Ask / Settings**。Atlas は Library の表示切替、Briefing・Echo は Today からの遷移。

| 画面ID | 画面名 | 役割 | 位置 |
| --- | --- | --- | --- |
| SC-01 | Today | Briefing・Inbox 件数・Echo・Insights・最近・同期ピル | タブ1 |
| SC-02 | Inbox | 要確認アイテムのトリアージ | タブ2（バッジ） |
| SC-03 | Library | 全 Source 閲覧。リスト／グリッド／**Atlas**。Lens | タブ3 |
| SC-04 | Ask | キーワード即時検索＋ハイブリッド検索＋RAG チャット | タブ4 |
| SC-05 | Settings | 同期、X 連携、AI レーン、通知、データ管理、MCP トークン | タブ5 |
| SC-06 | Reader（Source 詳細） | 原文・記事・要約の統合表示、AI 余白ノート、編集 | SC-01〜04 から |
| SC-07 | Knowledge Card | KC 閲覧・編集・ドラフト生成 | SC-03/04/06 から |
| SC-08 | Categories & Lens | 階層カテゴリ、Lens の管理 | SC-05 から |
| SC-09 | Sync & Jobs | 同期履歴、ジョブキュー、AI 予算メーター、再試行 | SC-01/05 から |
| SC-10 | Briefing | 当日 Briefing の全文・音声再生・アーカイブ | SC-01 から |
| SC-11 | Echo | 再浮上セッション（複数問） | SC-01 から |
| SC-12 | Capture | 共有ターゲット着地。URL/テキスト確認→取り込み | 外部共有から |
| SC-13 | Onboarding | 初回セットアップウィザード | 初回のみ |
| SC-14 | Atlas（Library 内） | クラスタ星図、タイムスライダー | SC-03 から |

### 8.1 SC-01 Today

- **構成（上から）**：
  1. **同期ピル**：`最終同期 12分前 · AI 処理待ち 3 · 予算 42%`。タップで SC-09。エラー時は赤ピル「X 再連携が必要」。
  2. **Briefing カード**（P2）：日付、見出し3行、「▶ 3分で聞く」「読む」。未生成なら「7:30 に生成予定」。MVP では「昨日の新着 N 件」サマリー。
  3. **Inbox チップ**：「要確認 2件 →」。0 件なら非表示。
  4. **Echo カード**（P2）：問い1つ＋3ボタン（同意／変わった／不要）。
  5. **Insights**（P2）：今週のテーマ1〜3個。
  6. **最近の Source**：横スクロールカード（8件）。
- **空状態**：X 未連携→「X と連携して始める」CTA 1つのみ。連携済み・0件→「初回取り込み中… 120/5,000」進捗。複数アカウント時はアカウントごとの進捗を並べる。
- **キャッシュ**：Briefing/Insights は `use cache`（`cacheTag('today')`）。同期ピルは Suspense で後ストリーム。

### 8.2 SC-02 Inbox

- **カードスタック**：1枚ずつ。内容：投稿者・本文冒頭 4 行・サムネ・AI 要約1行・**「迷った理由」1行**（例：「社会学/理論 と 思想 の境界」）・候補カテゴリチップ最大3（確信度％つき）・タグ候補。
- **ジェスチャー**：右スワイプ＝第一候補で確定、左スワイプ＝アーカイブ、上スワイプ＝「後で」（`snoozed_until` 翌日）、タップ＝カード展開（Reader 簡易版）。チップタップ＝そのカテゴリで確定。
- **PC**：`J/K` 移動、`1/2/3` 候補確定、`E` アーカイブ、`S` 後で、`Enter` 開く。
- **Undo**：5秒トースト。
- **一括**：ヘッダー「確信度 ≥ 70% を第一候補で一括確定（N件）」。
- **完了状態**：「Inbox は空です」＋ライブラリへの導線。
- **楽観更新**：`useOptimistic`。失敗時ロールバック＋再試行。

### 8.3 SC-03 Library（＋ SC-14 Atlas）

- **フィルタバー**：カテゴリ（階層ピッカー）、情報タイプ、状態（未読/読了/実践予定/実践済/KC化）、タグ、期間、`kind`（投稿/記事/手動）。Lens はフィルタバーにピン留め。
- **表示**：リスト（密）／グリッド（サムネ重視）／**Atlas**。
- **並び**：保存日、重要度、関連度（Lens 時）。
- **カーソルページネーション**：30件、Intersection Observer で追加読み込み。
- **Atlas（P2）**：`<canvas>`（`d3-force` + `d3-zoom`、または `pixi.js`）。ノード＝Source（最大 3,000 表示、超過は代表点に集約）。座標はサーバーで週次計算（PCA→UMAP 相当の近似、`source_layout` テーブル）。クラスタ命名は Flash-Lite。タップ→クラスタ内リスト、ロングタップ→そのクラスタを Lens 化。タイムスライダーで `saved_at` によるフェード。PC 優先、モバイルは簡易（ピンチズームのみ）。

### 8.4 SC-04 Ask

- **オムニボックス**：1つの入力。入力中は FTS 即時サジェスト（デバウンス 150ms、上位 8 件）。Enter でハイブリッド検索結果一覧（P1 は FTS のみ）。「AI に聞く」ボタン（または `⌘Enter`）で RAG チャットへ。
- **RAG チャット（P2）**：`useChat`。回答はストリーミング。`tool-searchKnowledge` パートを **Source カード**（サムネ、投稿者、一行要約、開くボタン）として回答内にインライン描画（生成UI）。文中の `[n]` はカードへスクロール。根拠不足時は明示バッジ「保存情報には見つかりませんでした」。
- **追質問チップ**：AI が提案する 3 つ（例「未実践のものだけ」「英語の情報源は？」）。
- **音声入力**：Web Speech API（`SpeechRecognition`、ja-JP）。非対応環境はボタン非表示。
- **「深く考える」トグル**：quality レーン（3.6 Flash）を使用。残り回数を表示（例「今日あと 7 回」）。
- **保存**：回答を KC のドラフトとして保存（引用 Source を `kc_sources` に）。
- **フィルタ連動**：ライブラリのフィルタ状態を Ask に持ち込める（「筋トレカテゴリの中で聞く」）。

### 8.5 SC-06 Reader（Source 詳細）

- **ヒーロー**：投稿者アバター・名前・日時・X で開く。サムネイルは一覧からの `<ViewTransition name="source-{id}">` 共有要素。
- **セグメント**：`原文 | 記事 | 要約`（記事がなければ 2 つ）。単一スクロールで、セグメントはアンカージャンプ。
- **原文**：全文、引用投稿は入れ子カード、メディアはギャラリー（画像タップでフルスクリーン、**OCR テキストを画像下に折り畳み表示**（P2））、スレッド展開があれば連結表示（P2）。
- **記事**：リーダー表示。`fetch_scope` を先頭にバッジ（全文／一部／概要のみ／失敗）。
- **要約**：「✦ AI」バッジ、3行要約、情報タイプ、重要度、タグ、カテゴリ（確信度）。「AI で再処理」。
- **Marginalia（P2）**：記事・原文の重要文を AI がハイライト（薄いマーカー色）、余白（PC は右カラム、モバイルはハイライトタップで下部シート）に注釈。ユーザーは選択→「ハイライト」「メモ」「これについて聞く」。
- **関連（P2）**：関連・重複・矛盾 Source。矛盾は警告色バナー。
- **下部固定バー**：状態変更（未読/読了/実践予定/実践済）、メモ、（P2）KC に追加、共有。
- **ユーザーメモ**：左ボーダー＋「自分のメモ」ラベル。AI 要約と明確に分離。

### 8.6 SC-07 Knowledge Card

- 上段：タイトル、一文要約、カテゴリ、状態（draft/active/archived）。
- **AI セクション**（バッジつき）：重要ポイント、主張と根拠（各根拠に Source リンク）、注意点。
- **自分のセクション**（インク色）：自分にとっての意味、活用、次にやること。
- 「AI を再生成」は AI セクションのみ更新。矛盾関連があれば注意バナー。
- Source 一覧（役割：根拠／反論／背景）。

### 8.7 SC-05 Settings

- **外部サービス / 課金（最上部）**：付録H の各サービスをカードで並べる。状態は `未設定 / 無料枠 / 有料ON / 停止`。**有料トグルはすべて既定 OFF**。OFF の機能はジョブを投入せず、Today に「設定が必要」バナーだけ出す。契約完了後に人間が ON にする（worker AI はトグルを勝手に ON にしない）。
  - X API：`x_api_enabled`（クレジット未購入なら OFF。ON にするまで `sync_bookmarks` は投入しない）
  - Gemini 有料：`ai_paid_enabled`（既定 OFF。ON でも月額上限で無料枠挙動に戻す）
  - スレッド展開：`thread_expand_enabled`（追加課金、$0.005/投稿。既定 OFF）
  - 代替 AI：Anthropic / OpenAI（`paid_providers_json`。キー未設定ならトグル無効）
  - 監視：Sentry / UptimeRobot（任意。未契約なら非表示）
- **X 連携**：接続中アカウント一覧（最大 3）。各アカウントの状態、再連携、個別解除、「アカウントを追加」、フォルダ選択（P2）、スレッド展開 ON/OFF と月次コスト上限（P2）。3 件に達したら追加ボタンを無効化。
- **同期**：間隔（15/30/60/360 分/手動）、返信を保存、除外ドメイン。
- **AI**：自動確定しきい値（0.6〜0.95）、レーン設定（bulk/quality モデル ID、日次ソフトキャップ）、「深く考える」を許可、有料利用（既定 OFF、月額上限 USD）、AI 一時停止。
- **通知**（P2）：Briefing 時刻、Inbox しきい値、テスト送信。
- **連携**（P2）：MCP エンドポイント URL とトークン（再発行）、Quick Capture トークン、iOS ショートカット導入手順。
- **データ**：エクスポート（Markdown/JSON）、全削除（危険ゾーン）。
- **表示**：テーマ（システム/ライト/ダーク）、文字サイズ、モーション低減。

### 8.8 SC-09 Sync & Jobs

- 上段：最終同期、次回予定、X レート制限残、X 推定コスト（当月）。
- **AI 予算メーター**：レーン別（bulk/quality/embed）に「本日 使用/上限」バー、リセット時刻（太平洋時間 0:00 = JST 16:00/17:00）。クールダウン中は理由表示。
- ジョブキュー：pending/running/failed 件数、最古 age、失敗ジョブの再試行ボタン。
- 同期履歴（sync_runs）テーブル。

### 8.9 SC-10 Briefing / SC-11 Echo / SC-12 Capture / SC-13 Onboarding

- **Briefing**：見出し、セクション（昨日の要点／気になる矛盾／追っているテーマ／今日の一問）。各項目に Source リンク。「▶ 聞く」は `speechSynthesis`（ja-JP 音声、速度 1.1）。アーカイブは日付ナビ。
- **Echo**：1問1画面。問い＋対象 Source/KC のカード＋3ボタン。最大 5 問/日。完了後「今日は以上」。
- **Capture**：共有された URL/テキストを表示、カテゴリ任意選択、「取り込む」。成功後 Reader へ。
- **Onboarding**（5ステップ）：①ようこそ（3枚のカード）→ ②X と連携 → ③（P2）フォルダ選択 → ④初回取り込み規模（最新 500 / 2,000 / 全部）と概算コスト・所要日数表示 → ⑤ホーム画面に追加の案内（iOS は共有シート手順のイラスト）＋通知許可（P2）。

---

## 9. 画面遷移

```
[開く] ─(初回)─▶ SC-13 Onboarding ─▶ SC-01
[開く] ───────▶ SC-01 Today
                 ├─▶ SC-10 Briefing ─▶ SC-06 Reader
                 ├─▶ SC-11 Echo ─▶ SC-06 / SC-07
                 ├─▶ SC-02 Inbox ─▶ SC-06
                 ├─▶ SC-03 Library ─▶ SC-06 / SC-07
                 │      └─▶ SC-14 Atlas ─▶ SC-03(フィルタ済) / Lens 作成
                 ├─▶ SC-04 Ask ─▶ SC-06 / SC-07(保存)
                 ├─▶ SC-09 Sync & Jobs
                 └─▶ SC-05 Settings ─▶ SC-08 / SC-09 / X OAuth
[外部共有] ─▶ SC-12 Capture ─▶ SC-06
```

タブ切替は `<Activity>` で各タブのスクロール位置・入力状態を保持する。

---

## 10. デザインシステム

### 10.1 トークン（Tailwind v4 `@theme`、OKLCH）

```css
@import "tailwindcss";
@theme {
  /* Paper & Ink */
  --color-paper: oklch(98% 0.005 90);        /* light bg */
  --color-paper-2: oklch(95.5% 0.008 90);
  --color-ink: oklch(22% 0.02 260);          /* text */
  --color-ink-2: oklch(45% 0.02 260);
  --color-line: oklch(88% 0.01 90);
  /* AI */
  --color-ai: oklch(62% 0.14 290);           /* AI badge / accents */
  --color-ai-soft: oklch(94% 0.04 290);      /* AI highlight bg */
  /* Marker (user highlight) */
  --color-marker: oklch(90% 0.16 95);
  /* Semantic */
  --color-accent: oklch(55% 0.16 250);
  --color-danger: oklch(58% 0.2 25);
  --color-warn: oklch(75% 0.15 70);
  --color-ok: oklch(65% 0.15 150);
  --radius-card: 1rem;
  --shadow-card: 0 1px 2px oklch(0% 0 0 / 6%), 0 8px 24px -12px oklch(0% 0 0 / 12%);
  --font-sans: "Inter Variable", "Noto Sans JP Variable", system-ui, sans-serif;
  --ease-spring: cubic-bezier(.2,.8,.2,1);
}
@media (prefers-color-scheme: dark) { :root { /* ink/paper を反転した値を再定義 */ } }
```

- ダークモードは `class` 戦略（`data-theme`）で system/light/dark を切替。
- **AI 生成物**：`bg-ai-soft` ＋ 先頭に `✦ AI` バッジ。**ユーザー記述**：`border-l-2 border-ink` ＋「自分のメモ」ラベル。**原文**：装飾なし。

### 10.2 タイポグラフィ

- 本文 16px/1.75、日本語は `font-feature-settings: "palt"`, `text-wrap: pretty`, `line-break: strict`, `hanging-punctuation: allow-end`。
- 見出しは Inter 600、本文は Noto Sans JP 400。数値は `font-variant-numeric: tabular-nums`。
- 文字サイズ設定は `html { font-size }` を 15/16/17/18px で切替。

### 10.3 モーション

- ページ遷移：`<ViewTransition>`。一覧サムネ→Reader ヒーローは `view-transition-name` を Source ID で共有。
- リスト挿入/削除：`<ViewTransition enter="fade-up" exit="fade">`。
- スワイプ：`framer-motion` の `drag`＋物理スプリング。閾値 35%、速度 500px/s で確定。
- `prefers-reduced-motion: reduce` でクロスフェードのみ。
- ハプティクス：Android は `navigator.vibrate(10)`（確定時）。iOS は非対応のため省略。

### 10.4 アクセシビリティ

- コントラスト AA、フォーカスリング可視、スワイプ操作には必ずボタン代替。
- `aria-live` で Undo トースト・処理完了を通知。
- 画像には alt（X の alt → AI 説明 → 「画像」の順にフォールバック）。

### 10.5 コンポーネント（shadcn/ui ベース）

`Button, Card, Badge, Chip(Toggle), Sheet(BottomSheet), Dialog, Tabs, SegmentedControl, Command(⌘K), Toast(Sonner), Skeleton, Progress, Slider, Switch, Tooltip, Popover, DropdownMenu, ScrollArea, Avatar, Separator`。独自：`SourceCard`, `SwipeCard`, `AIBadge`, `UserNote`, `BudgetMeter`, `SyncPill`, `Marginalia`, `CitationChip`, `AtlasCanvas`。

---

## 11. 主要操作フロー

1. **初回セットアップ**：Onboarding → X 連携 → 初回取り込み規模選択 → `sync_bookmarks{mode:'initial', limit}` 投入 → Today に進捗。
2. **日常同期**：外部 Cron（1〜5分）→ `POST /api/jobs/tick` → `job_schedules` 評価 → `sync_bookmarks` → `article_fetch` / `enrich_batch` / `embed_source` をキュー投入 → 同 tick または後続 tick で消化。
3. **アプリ起動時**：クライアントが `POST /api/jobs/tick`（60秒に1回まで）→ Cron 未達時のフォールバック。
4. **手動同期**：`POST /api/sync` → 即時 `sync_bookmarks` 実行、`after()` で後続ジョブを同一リクエスト内で数件消化。
5. **Inbox 処理**：確定/修正 → `feedback_examples` へ記録（AI と異なる場合）→ 埋め込み（P2）。
6. **Ask**：質問 → ハイブリッド検索（tool）→ 回答ストリーム → 引用保存 → 任意で KC 化。
7. **Briefing**：`job_schedules` の 07:00 JST → `build_briefing` → 完成で Push。
8. **Echo**：日次 `schedule_echo` が `recall_items` から当日分を選定 → Today に表示 → 反応で次回間隔更新。
9. **MCP**：外部クライアント → `/api/mcp`（Bearer）→ ツール実行（検索は DB のみ、AI 予算を消費しない）。

---

## 12. システム構成図

```
┌──────────────────────────── クライアント ────────────────────────────┐
│ スマホ/PC ブラウザ（Next.js 16.3 App Router + PWA / Service Worker）    │
│ ・Instant Navigations（App Shell 事前取得）・ViewTransition           │
│ ・Web Speech（音声入力/読み上げ）・Web Push・Badging                    │
└───────┬───────────────────────────────────────────────┬───────────────┘
        │ HTTPS（同一オリジン）                         │ Web Push
┌───────▼──────────────────────────────┐        ┌───────▼────────┐
│ Vercel Hobby（Fluid compute, hnd1）    │        │ APNs / FCM     │
│ ├ RSC / Server Actions / Route Handlers│        └────────────────┘
│ ├ /api/jobs/tick（ワーカー入口）        │
│ ├ /api/mcp（MCP サーバー, Bearer）      │◀── Claude / ChatGPT / Cursor
│ ├ /api/capture（Quick Capture, Bearer） │◀── iOS ショートカット / Android 共有
│ └ proxy.ts（任意 APP_PASSCODE）         │
└───────┬──────────────────────────────┘
        │ @libsql/client（HTTP）
┌───────▼──────────────────────────────┐
│ Turso Free（libSQL, aws-ap-northeast-1）│
│ ├ アプリデータ  ├ FTS5(trigram)         │
│ ├ vector(F32_BLOB 768 + DiskANN)        │
│ ├ jobs / job_schedules（キュー）         │
│ └ ai_usage_daily（AI予算）               │
└──────┬─────────────────────┬─────────┘
       │                     │
┌──────▼──────┐      ┌───────▼────────────────────────┐
│ X API v2    │      │ Gemini API（AI Studio 無料枠）    │
│ bookmarks   │      │ bulk:  gemini-3.5-flash-lite      │
│ folders     │      │ quality: gemini-3.6-flash         │
│ OAuth2 PKCE │      │ embed: gemini-embedding-2 (768)   │
└─────────────┘      └───────────────────────────────────┘

外部 Cron（無料）: cron-job.org（推奨、1分）または GitHub Actions schedule（5分）
  → POST /api/jobs/tick（Authorization: Bearer CRON_SECRET）
```

---

## 13. 技術スタック（2026-09 版）

### 13.1 採用構成（バージョンは着手時に最新パッチへ）

| レイヤ | 採用 | 備考 |
| --- | --- | --- |
| ランタイム | **Node.js 24 LTS**、**pnpm 10** | Vercel 対応 |
| フレームワーク | **Next.js 16.3.x**（App Router、Turbopack、`cacheComponents: true`、`partialPrefetching: true`、React Compiler） | `middleware.ts` は **`proxy.ts`** に置換。ナビゲーション回帰は `@next/playwright` の `instant()` で検査 |
| UI | **React 19.2**、**Tailwind CSS v4**、**shadcn/ui**（最新）、`framer-motion`、`sonner`、`cmdk`、`lucide-react` | `<ViewTransition>` / `<Activity>` / `useOptimistic` |
| データ取得 | RSC + Server Actions を基本。クライアント側の一覧・無限スクロールは **TanStack Query v5**（`persistQueryClient` で IndexedDB 永続化） | オフライン閲覧に寄与 |
| ホスティング | **Vercel Hobby**（Fluid compute、Functions 最大 300 秒、リージョン **hnd1**） | 個人非商用 $0 |
| DB | **Turso Free（libSQL）** `libsql://x-idea-brutaldisco.aws-ap-northeast-1.turso.io` | 5GB / 500M rows read / 10M rows written / 月。**超過時ブロック** |
| DB クライアント / ORM | **`@libsql/client`** + **Drizzle ORM 1.0**（`drizzle-kit` で SQL マイグレーション） | Turso ダッシュボードが `turso://` URL を配る場合は `@tursodatabase/serverless` を使用可（`libsql://` のままなら `@libsql/client`） |
| 全文検索 | **SQLite FTS5 `tokenize='trigram'`** | 日本語・英語とも 3-gram。2文字以下のクエリは `LIKE` フォールバック |
| ベクトル | **libSQL vector**：`F32_BLOB(768)`、`libsql_vector_idx(embedding, 'compress_neighbors=float1bit', 'max_neighbors=32')`、`vector_top_k` | 5万チャンクで約 150MB（本体）＋約 160MB（索引） |
| AI SDK | **AI SDK 6**（`ai`、`@ai-sdk/google`、`@ai-sdk/react`）＋ **Zod 4** | `Output.object` で構造化出力、`ToolLoopAgent` で Ask、`useChat` 生成UI |
| AI モデル | bulk **`gemini-3.5-flash-lite`**、quality **`gemini-3.6-flash`**、embed **`gemini-embedding-2`**（`outputDimensionality: 768`） | すべて設定で差し替え可（`settings.ai_models_json`）。着手時に AI Studio の Rate limits 画面で実クォータを確認 |
| ジョブ | Turso `jobs` + `job_schedules` + 外部 Cron + `after()` | 専用キュー基盤なし |
| MCP | **`mcp-handler` 2.x**（`@modelcontextprotocol/server` v2、MCP 仕様 2026-07-28 対応） | `/api/mcp` に Streamable HTTP |
| PWA | **Serwist**（Service Worker）、`web-push`（VAPID）、Web App Manifest（`share_target` 含む） | iOS は「ホーム画面に追加」した PWA のみ Push 可 |
| 記事抽出 | `@mozilla/readability` + `linkedom`、`sanitize-html`、`robots-parser` | |
| 検証 | **Vitest 4**、**Playwright**（`@next/playwright`）、`msw`（X/Gemini モック） | |
| Lint/Format | **Biome** | ESLint より高速・設定1ファイル |
| CI | GitHub Actions（lint・型・単体・E2E スモーク） | |
| 監視 | `/api/health`、Vercel Logs、任意 Sentry Free、任意 UptimeRobot | |

### 13.2 フリーミアム完結の原則（更新）

1. **有料必須は X API のみ**（Owned Reads $0.001/リソース）。
2. Vercel / Turso / Gemini は無料枠内。**Gemini は日次クォータが小さいため「AI 予算」を第一級の制約として設計**（16章）。
3. Turso Free は超過時ブロック。**インデックス設計とページネーションで rows read を抑える**。ベクトル検索は必ず `vector_top_k`（フルスキャン禁止）。
4. Gemini 429（`QuotaFailure`）を検知したらレーン単位でクールダウン。**課金へ自動エスカレーションしない**。
5. Vercel Workflows（Hobby 5万イベント/月）は上限到達で 30 日停止するため主系にしない。

### 13.3 代替案とトレードオフ

| 構成 | 利点 | 欠点 | 判断 |
| --- | --- | --- | --- |
| Vercel Workflows（`"use workflow"`） | 耐久実行・再試行・可観測性が組み込み | Hobby は 5万イベント/月、超過で 30 日停止。ロックイン | **不採用（主系）**。Pro 移行時の選択肢 |
| Turso（新エンジン `--tursodatabase`） | 同時書き込み、CDC | Turso Cloud 上は早期プレビュー | **libSQL を採用**。安定後に移行可 |
| Cloudflare Workers + D1 + Queues | Cron/Queue 内蔵、無料枠広い | Next.js 16 の全機能互換に注意、D1 に vector なし | 不採用（tick トリガー役としては可） |
| Supabase | Auth/RLS/pgvector | 本要件では過剰、Free→Pro 圧 | 不採用 |
| ローカル埋め込み（`@xenova/transformers`） | クォータ無制限 | Vercel Functions で重い、日本語品質 | 将来オプション |
| Anthropic / OpenAI | 品質 | 無料枠なし | `ai_models_json` で差し替え可能な有料オプション |

### 13.4 ローカル開発

- `turso dev --db-file local.db` または `file:local.db` で開発。`drizzle-kit migrate` を本番と同じ SQL で適用。
- `.env.local` は付録D。`pnpm dev` で Turbopack 起動。
- X / Gemini は `msw` フィクスチャでモック可能（`MOCK_EXTERNAL=1`）。

---

## 14. X連携方式

> 事実関係は 2026-09-04 時点の docs.x.com / Developer Console に基づく。料金・制限は変更が多いため、着手時に必ず再確認（R-01）。

### 14.1 公式 API の現状

- **料金**：クレジット制の従量課金（pay-per-use）のみ。**Owned Reads**（自分のアプリで自分のデータを読む）は **$0.001/リソース**（2026-04-20 改定）。`GET /2/users/{id}/bookmarks`、`GET /2/users/{id}/bookmarks/folders`、`GET /2/users/{id}/bookmarks/folders/{folder_id}` が該当（`{id}` が認証ユーザー＝アプリ所有者のとき）。
- **重複課金の排除**：同一リソースは 24 時間内は再課金されない（ソフト保証）。
- **一般の投稿読み取り**（スレッド展開で使用）：**$0.005/投稿**。
- **レート制限**：bookmarks は 180 リクエスト/15分/ユーザー。
- **認証**：OAuth 2.0 Authorization Code with PKCE。スコープ `bookmark.read tweet.read users.read offline.access`。
- **取得仕様**：`max_results` 1〜100、`pagination_token`。自身のブックマークのみ。

### 14.2 認証フロー（アプリログインなし、複数アカウント）

**v3.2（ADR-002）**：`x_account` はシングルトンではなく **最大 3 行**。追加は Settings の「アカウントを追加」から行い、同じ X アカウント（`x_user_id`）は上書き更新する。アプリ側のログイン／ユーザー切替は作らない。

```
[Settings/Onboarding] 「X と連携」または「アカウントを追加」
  → GET /api/x/oauth/start
      state / code_verifier を HttpOnly 暗号化 Cookie（10分）に保存
      → https://x.com/i/oauth2/authorize?...&code_challenge_method=S256
  → 同意 → GET /api/x/oauth/callback?code&state
  → トークン交換 → GET /2/users/me
  → x_account に upsert（x_user_id 一意、最大 3）→ /onboarding?step=3 へ
```

- ジョブ実行時に期限を確認し、失効 5 分前ならリフレッシュ。失敗はその行の `status='reauth_required'`、Today に赤ピル、（P2）Push。
- 3 件目以降の追加は拒否し、Settings に「上限 3」と表示する。

### 14.3 差分取得アルゴリズム

Bookmarks API は新しい順。**前回同期時の先頭既知 ID に到達したら打ち切る**。

```
sync_bookmarks(x_account_id, mode = 'incremental' | 'initial', initial_limit?):
  token = ensure_valid_token(x_account_id)
  known_head = x_account.last_sync_head_tweet_id
  new_head = null; pagination = null; fetched = []
  max_pages = mode == 'initial' ? ceil(initial_limit / 100) : 10
  loop max_pages:
    page = GET /2/users/:id/bookmarks?max_results=100
             &tweet.fields=id,text,author_id,created_at,lang,entities,attachments,referenced_tweets,conversation_id,note_tweet,public_metrics
             &expansions=author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id
             &user.fields=username,name,profile_image_url
             &media.fields=media_key,type,url,preview_image_url,alt_text,duration_ms,width,height
    if new_head is null and page.data: new_head = page.data[0].id
    for t in page.data:
      if t.id == known_head: goto done
      if exists(x_posts.tweet_id = t.id): continue
      fetched.push(t)
    if !page.meta.next_token: goto done
  done:
    upsert fetched → x_posts / sources / media_assets / source_articles(pending)
    enqueue article_fetch(per url) ; enqueue enrich_batch(coalesce)
    x_account.last_sync_head_tweet_id = new_head ?? known_head
    x_account.last_synced_at = now
    sync_runs に記録（x_account_id, pages, new, cost_estimate = resources * 0.001）
```

- `note_tweet` があれば長文本文を優先。
- 削除・非公開は `errors[]` から `sources.availability` を更新。
- 返信投稿は `settings.save_replies`（既定 保存）。
- 編集追跡は行わない **[仮定]**。

### 14.4 ブックマークフォルダ連動（P2）

- 日次 `sync_folders`：`GET /2/users/:id/bookmarks/folders` → `x_bookmark_folders` を upsert。
- 設定で「同期するフォルダ」を選択。選択フォルダごとに `GET .../folders/:folder_id`（max 100/ページ、既知 ID で打ち切り）→ `x_post_folders` を upsert。
- **フォルダ→カテゴリ写像**（`x_bookmark_folders.category_id`）が設定されていれば、enrich 時に **強いヒント**として渡し、写像先が候補にあれば確信度に +0.15 を加算 **[仮定]**。ユーザーが写像を「確定扱い」にした場合は `category_source='user'` で直接確定。
- コスト：選択フォルダ内の投稿数 × $0.001/日（24h 重複排除により当日本体同期で読んだ分は再課金されない見込み）。設定画面に概算表示。

### 14.5 スレッド展開（P2、コスト上限つき）

- 対象：`conversation_id == id`（起点投稿）かつ投稿から 7 日以内。
- `GET /2/tweets/search/recent?query=conversation_id:{id} from:{author} to:{author}&max_results=100` → 同一著者の連投を `x_posts` に保存し `thread_root_id` で連結。Source は起点のみ（連投は Reader で連結表示、enrich 入力にも連結）。
- 上限：1 スレッド 25 投稿、月次コスト上限（既定 $2）。超過時はスキップし Reader に「スレッド未取得」を表示。

### 14.6 同期頻度・手動同期

| 項目 | 設計 |
| --- | --- |
| 定期 | 既定 30 分（15/30/60/360 分/手動） |
| 手動 | Today のピルから。最短 60 秒 |
| tick | 外部 Cron 1〜5 分＋アプリ起動時 |
| レート制限 | `x-rate-limit-*` を `sync_runs` に記録。429 は reset＋ジッターで再試行 |

### 14.7 料金概算

| シナリオ | 月額 |
| --- | --- |
| 通常（20件/日） | **$0.6〜1.5** |
| フォルダ同期（3フォルダ・計300件） | ＋ **$0〜1** |
| スレッド展開（上限） | ＋ **$2 まで** |
| 初回全量 5,000 件 | 一時 **$5** |

Developer Console のスペンディングリミット（例 $10）を必須とする。

### 14.8 公式 API が使えない場合

X データダウンロードからの手動補完、Quick Capture による手動登録のみ。非公式 API／スクレイピングは採用しない。

---

## 15. 記事取得方式

### 15.1 方針

「合法かつ礼儀正しく取れる範囲だけ取る」。

```
article_fetch(url):
  1. URL 正規化（t.co 展開、UTM 除去、短縮 URL 解決 上限5、末尾スラッシュ・フラグメント除去）
  2. articles.normalized_url で重複確認
  3. 除外ドメインなら metadata_only
  4. robots.txt 確認（robots-parser）→ 拒否なら metadata_only
  5. HTML 取得（UA: "MarginaliaBot/1.0 (+contact)", 15秒, 3MB, text/html のみ, リダイレクト5）
  6. OGP / Twitter Card / JSON-LD → メタデータ
  7. Readability で本文 → sanitize-html → content_html / content_text
  8. 短文（<400字）/ ペイウォール検出 → partial / metadata_only
  9. 保存、enrich_batch に再投入（記事付きで再要約が必要な場合）
```

### 15.2 `fetch_scope`

| 値 | 意味 |
| --- | --- |
| `full` | 本文全体 |
| `partial` | 一部 |
| `metadata_only` | 本文不可（ペイウォール/robots/除外） |
| `failed` | 失敗（一時エラーのみ再試行） |

### 15.3 X 内リンク・X Articles

- 別 X 投稿：`x_posts` に保存し `x_post_links` で関係記録。ブックマーク由来でなければ Source 化しない **[仮定]**。
- X Articles / 長文 `note_tweet`：本文として扱う。

### 15.4 著作権・規約

私的アーカイブ用途のみ。再配布・公開機能を持たない。robots / noarchive を尊重。出典 URL を常に表示。

---

## 16. AI処理設計（AI予算とモデルルーティング）

### 16.1 原則

1. **非同期**：収集と AI を分離。AI 障害でも同期は止まらない。
2. **原文不変**：AI は原文カラムを書き換えない。
3. **人間優先**：`*_source='user'` は AI 再処理で上書きしない。
4. **確信度駆動**：しきい値（既定 0.80）で自動確定／Inbox。
5. **監査可能**：モデル・プロンプト版・トークン数を `enrichments` に記録。
6. **予算駆動**：レーン別に日次クォータを追跡。429 は課金へ逃げず先送り。
7. **学習する司書**：ユーザー修正を例として蓄積し、類似例をプロンプトに注入。

### 16.2 レーンとモデル

| レーン | 既定モデル | 無料枠（2026-09-02 実測、無保証） | 用途 | 日次ソフトキャップ既定 |
| --- | --- | --- | --- | --- |
| `bulk` | `gemini-3.5-flash-lite` | 15 RPM / **500 RPD** | enrich（バッチ）、タグ正規化、クラスタ命名、Echo 問い生成、Ask 既定回答、Marginalia 注釈 | 400 |
| `quality` | `gemini-3.6-flash` | 5 RPM / **20 RPD** | Daily Briefing（1）、Insights（週1）、KC ドラフト、Ask「深く考える」、矛盾の二次判定 | 16 |
| `embed` | `gemini-embedding-2`（768 次元） | 100 RPM / **1,000 RPD** | チャンク埋め込み、画像埋め込み、クエリ埋め込み、修正例埋め込み | 800 |

- `thinkingLevel`：bulk は `MINIMAL`（分類）／`LOW`（要約）、quality は `MEDIUM`。
- モデル ID は `settings.ai_models_json` で差し替え可能。**着手時に AI Studio の Rate limits 画面で実クォータを確認し、`ai_lane_caps_json` を合わせる**。
- 有料利用（`ai_paid_enabled`）は既定 OFF。ON にしても月額上限（`ai_paid_monthly_cap_usd`、既定 $5）を超えたら無料枠挙動に戻す。**429 で自動 ON しない。**
- `x_api_enabled` が 0 のあいだは `sync_bookmarks` / `sync_folders` / `expand_thread` を投入しない（T-104 のガード）。X クレジット契約は即日できないことがある（付録H）。

### 16.3 AI 予算管理（F-25）

```
ai_usage_daily(day_pt, lane, model, requests, input_tokens, output_tokens, cost_usd)

before_call(lane):
  if lane_cooldown_until[lane] > now: throw LaneCooldown
  if usage(today_pt, lane) >= cap[lane]: throw LaneCapReached
after_call: usage += 1, tokens 記録
on 429:
  parse error.details[].quotaId / quotaMetric
  if quotaId endswith 'PerDay...': cooldown_until = next_midnight_pacific
  else: cooldown_until = now + 60s * (1 + jitter)
ジョブ側: LaneCooldown / LaneCapReached を受けたら run_after = cooldown_until + jitter、attempts を増やさない
```

- 日次リセットは **太平洋時間 0:00**（JST 16:00/17:00）。メーター表示にリセット時刻を出す。
- 優先度：日次キャップ残が少ないとき、`enrich_batch` は **新しい Source を優先**、バックフィルは後回し。

### 16.4 enrich_batch（MVP）

1 回の呼び出しで **最大 5 Source**（画像添付ありの場合は最大 2）をまとめて処理する。通常運用（20〜50 件/日）でも 10〜25 呼び出し/日に収まる。

```
入力（各 Source ごと）:
  - 投稿本文（note_tweet 優先）・投稿者・引用・（P2）スレッド連結
  - 記事タイトル＋本文先頭 2,000 字（取得済みなら）
  - （P2）画像 最大4枚（サーバーで取得し inline、各 ≤1MB、長辺 1,024px に縮小）
共通コンテキスト:
  - 既存カテゴリツリー（id: パス — 説明）
  - 頻出タグ上位 100
  - 情報タイプ定義
  - （P2）類似する過去の修正例 最大 5（feedback_examples から埋め込み近傍）
  - （P2）X フォルダ写像ヒント

出力（Output.object、Zod スキーマ）:
  { items: [{
      source_id,
      summary: string(≤160字, 3行以内),
      category_id: string|null, category_confidence: 0..1,
      category_candidates: [{category_id, confidence}] (≤3),
      new_category_suggestion: string|null,
      uncertainty_reason: string|null (≤40字, Inbox 表示用),
      tags: string[] (1..5),
      info_type: enum, info_type_confidence,
      importance: 1|2|3,
      language: 'ja'|'en'|..., 
      key_sentences: string[] (≤3, Marginalia 用・原文からの逐語抜き出し),
      media: [{ index, ocr_text: string|null, description: string|null }]   // P2
  }] }

後処理:
  - Zod 検証失敗 → 1 回だけ再試行（同バッチ）→ 失敗なら各 Source を needs_review
  - category_confidence ≥ threshold かつ category_id あり → triage_status='auto_filed'
  - それ以外 → 'needs_review'（候補 ≤3、uncertainty_reason 保存）
  - tags は NFKC 正規化・小文字化・同義語辞書（tag_aliases）で統合
  - key_sentences は原文中に存在するもののみ採用（部分一致で検証）
  - enrichments に記録（batch_id, model, prompt_version, tokens）
```

### 16.5 学習する司書（F-26）

- ユーザーが Inbox やReader で AI と異なるカテゴリ／情報タイプ／タグに修正したとき、`feedback_examples` に `{source_id, input_digest(本文冒頭300字+記事タイトル), ai_output, user_output, created_at}` を保存。MVP では蓄積のみ。
- P2：`feedback_examples.embedding` を作成し、enrich 時に対象 Source と類似する修正例を最大 5 件取得して「過去にユーザーはこう修正した」としてプロンプトに注入。
- 効果測定：`enrichments` に `few_shot_ids_json` を残し、S3/S4 を月次で確認。

### 16.6 埋め込み（P2）

- チャンク：投稿本文＝1 チャンク（引用・OCR を連結）、記事＝約 800 トークンごと最大 6 チャンク、KC＝1 チャンク、画像＝1 画像 1 ベクトル（Embedding 2 の画像入力）。
- `outputDimensionality: 768`（自動正規化）。`taskType`：文書は `RETRIEVAL_DOCUMENT`、クエリは `RETRIEVAL_QUERY`。
- 1,000 RPD 内：50 Source/日 × 平均 3 チャンク ＝ 150 呼び出し。初回 5,000 件は 15,000 チャンク ≒ 19 日 → **バックフィルは新しい順、かつ「投稿本文チャンクのみ先行」**（記事チャンクは後追い）で体験を先に成立させる。

### 16.7 Ask（RAG、P2）

- `ToolLoopAgent`（bulk レーン既定、「深く考える」で quality）。
- ツール：`searchKnowledge({query, filters, k})`（ハイブリッド検索）、`getSource({id})`、`listCategories()`。
- 指示：保存情報のみを根拠に回答。根拠は `[n]` で引用。不足は明言。一般知識で補う場合は「（一般知識）」と明示して分離。日本語で簡潔。
- 出力：`createAgentUIStreamResponse`。クライアントは `tool-searchKnowledge` パートを Source カードとして描画。
- 会話は `qa_sessions/qa_messages` に保存（引用 `citations_json`）。

### 16.8 Briefing / Insights / Echo の AI（P2）

24 章参照。Briefing は quality レーン 1 回/日、Insights は quality 1 回/週、Echo の問い生成は bulk で 1 回/日（5 問まとめて）。

### 16.9 再処理・プロンプト管理

- 「AI で再処理」ボタン（Reader）。ユーザー確定フィールドは保持。
- プロンプトは `src/server/ai/prompts/*.ts` に `PROMPT_VERSION` 定数つきで管理（付録B）。

---

## 17. バックグラウンドジョブ設計

### 17.1 方式

Turso 上の `jobs` テーブル＋HTTP tick。SQLite は書き込み直列のため楽観的な 1 件払い出しで十分。

```sql
UPDATE jobs
SET status='running', started_at=datetime('now'), attempts=attempts+1, locked_by=:worker
WHERE id = (
  SELECT id FROM jobs
  WHERE status='pending' AND run_after <= datetime('now')
  ORDER BY priority DESC, created_at
  LIMIT 1
)
RETURNING *;
```

### 17.2 ジョブ種別

| type | 内容 | トリガー | 優先度 | タイムアウト | レーン |
| --- | --- | --- | --- | --- | --- |
| `sync_bookmarks` | 差分/初回同期 | schedule / 手動 | 100 | 120s | — |
| `sync_folders`（P2） | フォルダ同期 | 日次 | 90 | 120s | — |
| `expand_thread`（P2） | スレッド展開 | sync 後 | 60 | 60s | — |
| `article_fetch` | 記事取得 | sync 後 | 50 | 60s | — |
| `enrich_batch` | AI 整理（最大5件） | sync/記事取得後に coalesce | 40 | 120s | bulk |
| `embed_source`（P2） | 埋め込み | enrich 後 | 30 | 60s | embed |
| `relate_source`（P2） | 関連/重複/矛盾 | embed 後 | 20 | 90s | bulk/quality |
| `build_briefing`（P2） | Briefing 生成 | 日次 07:00 JST | 35 | 180s | quality |
| `build_insights`（P2） | 週次 Insights | 日曜 08:00 JST | 15 | 240s | quality |
| `schedule_echo`（P2） | 当日の Echo 選定＋問い生成 | 日次 06:00 JST | 25 | 120s | bulk |
| `compute_layout`（P2） | Atlas 座標・クラスタ | 週次 | 10 | 240s | bulk（命名） |
| `send_push`（P2） | Web Push 送信 | イベント | 80 | 30s | — |
| `export_build`（P2） | エクスポート生成 | 手動 | 5 | 240s | — |

### 17.3 実行モデル

- **起動**：外部 Cron が 1〜5 分毎に `POST /api/jobs/tick`（`Authorization: Bearer CRON_SECRET`）。加えてアプリ起動時にクライアントから tick（同一シークレットは使わず、`/api/jobs/tick?source=client` はオリジン同一・60 秒に 1 回のサーバー側スロットル）。
- **スケジュール**：tick 冒頭で `job_schedules`（`key, cron_expr, tz, last_run_at, enabled`）を評価し、期限到達のものを `jobs` に投入（重複投入防止に `UNIQUE(type, dedupe_key) WHERE status IN ('pending','running')`）。
- **1 tick の仕事量**：最大 N 件（既定 5）または 240 秒で終了。`enrich_batch` は 1 tick に 2 件まで（RPM 保護）。
- **coalesce**：`enrich_batch` は `pending` の enrich 対象 Source を最大 5 件まとめて 1 ジョブ化（`payload.source_ids`）。sync 直後に投入し、記事取得完了で再要約が必要なら `needs_reenrich=1` を立てて次バッチへ。
- **再試行**：指数バックオフ `1m * 2^attempts`（最大 5 回）。レーン起因（`LaneCooldown` / `LaneCapReached`）は attempts を増やさず `run_after` のみ更新。
- **ゾンビ回収**：`running` かつ `started_at + timeout < now` を `pending` に戻す。
- **直列化**：`sync_bookmarks` は同時 1 本（`dedupe_key='sync'`）。
- **`after()`**：手動同期など UI 起点の処理は、レスポンス返却後に `after(() => runJobs({max: 3}))` で後続ジョブを即時消化する。

### 17.4 Cron 配置

| 手段 | 用途 |
| --- | --- |
| cron-job.org（無料、1 分間隔可） | 本番 tick（推奨。ヘッダーでシークレット） |
| GitHub Actions `schedule`（最短 5 分、遅延あり） | 代替／二重化 |
| Vercel Cron（Hobby は日次のみ） | 日次の保険（`build_briefing` の再確認など） |

---

## 18. データモデル

### 18.1 設計方針

- Source と Knowledge Card の分離。AI 出力とユーザー入力の分離（`ai_*` / `user_*`、`*_source`）。原文不変。
- シングルテナント：`user_id` なし。設定はシングルトン。**X 連携は最大 3 アカウント**（v3.2、ADR-002）。`user_id` は追加しない。
- SQLite 型：ID は TEXT（ULID）、真偽は INTEGER 0/1、時刻は ISO8601 TEXT（UTC）、JSON は TEXT、ベクトルは `F32_BLOB(768)`。
- rows read 抑制：一覧はカーソルページネーション必須、フィルタ用インデックスを最初から張る、ベクトルは索引経由のみ。

### 18.2 主要エンティティ

| エンティティ | 役割 |
| --- | --- |
| `settings` | 設定（1 行） |
| `x_account` | X 連携（最大 3 行、v3.2） |
| `x_bookmark_folders` / `x_post_folders` | フォルダ（P2） |
| `sources` | 保存単位の中核 |
| `x_posts` / `articles` / `source_articles` / `media_assets` | 一次情報 |
| `categories` / `tags` / `tag_aliases` / `source_tags` | 分類 |
| `enrichments` / `feedback_examples` / `ai_usage_daily` | AI 記録・学習・予算 |
| `source_chunks` / `media_embeddings` | 検索チャンク＋埋め込み（P2） |
| `source_relations` | 関連・重複・矛盾（P2） |
| `highlights` | ユーザー／AI ハイライト（Marginalia、P2） |
| `knowledge_cards` / `kc_sources` / `kc_relations` | KC（P2） |
| `lenses` | スマートコレクション（P2） |
| `briefings` / `insights` / `recall_items` / `recall_events` | 押し出し系（P2） |
| `source_layout` | Atlas 座標（P2） |
| `qa_sessions` / `qa_messages` | Ask 履歴（P2） |
| `push_subscriptions` | Web Push（P2） |
| `jobs` / `job_schedules` / `sync_runs` | キューと履歴 |

---

## 19. テーブル定義（DDL）

Turso / libSQL（SQLite 方言）。Drizzle スキーマ（`src/db/schema.ts`）はこの DDL と一致させ、マイグレーションは `drizzle/` に SQL として生成・Git 管理する。**MVP 時点で全テーブルを作成**する（P2 テーブルも空で作る）。

**適用順（ADR-001）**: 下記は説明用の並び。実行正本は `drizzle/0000_init.sql`。`categories` を `x_bookmark_folders` より先、`knowledge_cards` を `source_chunks` より先に作る（FK）。ベクトル索引は Turso 専用で、ローカル `file:` ではスキップしてよい。

```sql
PRAGMA foreign_keys = ON;

-- 設定（シングルトン）
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sync_interval_min INTEGER NOT NULL DEFAULT 30,
  save_replies INTEGER NOT NULL DEFAULT 1,
  auto_file_threshold REAL NOT NULL DEFAULT 0.8,
  excluded_domains_json TEXT NOT NULL DEFAULT '[]',
  ai_models_json TEXT NOT NULL DEFAULT '{"bulk":"gemini-3.5-flash-lite","quality":"gemini-3.6-flash","embed":"gemini-embedding-2"}',
  ai_lane_caps_json TEXT NOT NULL DEFAULT '{"bulk":400,"quality":16,"embed":800}',
  x_api_enabled INTEGER NOT NULL DEFAULT 0,          -- クレジット契約後に人間が ON。OFF なら sync 投入禁止
  ai_paid_enabled INTEGER NOT NULL DEFAULT 0,        -- Gemini 有料。既定 OFF。429 で自動 ON しない
  ai_paid_monthly_cap_usd REAL NOT NULL DEFAULT 5,
  ai_paused INTEGER NOT NULL DEFAULT 0,
  allow_deep_think INTEGER NOT NULL DEFAULT 1,
  paid_providers_json TEXT NOT NULL DEFAULT '{"anthropic":false,"openai":false}',
  observability_json TEXT NOT NULL DEFAULT '{"sentry":false,"uptime_robot":false}',
  thread_expand_enabled INTEGER NOT NULL DEFAULT 0,
  thread_expand_monthly_cap_usd REAL NOT NULL DEFAULT 2,
  briefing_time_local TEXT NOT NULL DEFAULT '07:00',
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  last_sync_head_tweet_id TEXT,
  last_synced_at TEXT,
  initial_import_state_json TEXT, -- {requested, fetched, enriched, embedded, done}
  onboarding_done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO settings (id) VALUES (1);

-- X 連携（シングルトン運用）
-- X 連携（v3.2: 最大 3 行。アプリ側のユーザー概念は追加しない）
CREATE TABLE x_account (
  id TEXT PRIMARY KEY,
  x_user_id TEXT NOT NULL UNIQUE,
  x_username TEXT NOT NULL,
  x_name TEXT,
  x_avatar_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | reauth_required | revoked
  sync_enabled INTEGER NOT NULL DEFAULT 1,
  last_sync_head_tweet_id TEXT,           -- アカウント別の同期カーソル
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE x_bookmark_folders (              -- P2
  id TEXT PRIMARY KEY,                          -- X folder id
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  mapping_mode TEXT NOT NULL DEFAULT 'hint',    -- hint | confirm | ignore
  sync_enabled INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE x_post_folders (                   -- P2
  tweet_id TEXT NOT NULL,
  folder_id TEXT NOT NULL REFERENCES x_bookmark_folders(id) ON DELETE CASCADE,
  PRIMARY KEY (tweet_id, folder_id)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (parent_id, name)
);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL DEFAULT 'x_bookmark',    -- x_bookmark | manual
  kind TEXT NOT NULL CHECK (kind IN ('x_post','article','note')),
  x_account_id TEXT REFERENCES x_account(id) ON DELETE SET NULL, -- v3.2: どのアカウント由来か
  x_post_id TEXT,
  article_id TEXT,
  bookmarked_at TEXT,
  saved_at TEXT NOT NULL DEFAULT (datetime('now')),
  availability TEXT NOT NULL DEFAULT 'available', -- available | deleted | protected | unavailable
  ai_summary TEXT,
  ai_importance INTEGER,
  ai_key_sentences_json TEXT,
  ai_uncertainty_reason TEXT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  category_source TEXT NOT NULL DEFAULT 'none',  -- none | ai | user | folder
  category_confidence REAL,
  category_candidates_json TEXT,
  info_type TEXT,
  info_type_source TEXT NOT NULL DEFAULT 'none',
  triage_status TEXT NOT NULL DEFAULT 'pending', -- pending | auto_filed | needs_review | confirmed | archived
  read_status TEXT NOT NULL DEFAULT 'unread',    -- unread | read | to_practice | practiced | knowledged
  user_note TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  snoozed_until TEXT,
  needs_reenrich INTEGER NOT NULL DEFAULT 0,
  embed_status TEXT NOT NULL DEFAULT 'pending',  -- pending | partial | done | skipped
  language TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE x_posts (
  id TEXT PRIMARY KEY,
  tweet_id TEXT NOT NULL UNIQUE,
  conversation_id TEXT,
  thread_root_id TEXT,                           -- P2: セルフスレッドの起点 tweet_id
  thread_index INTEGER,                          -- P2
  author_id TEXT NOT NULL,
  author_username TEXT,
  author_name TEXT,
  author_avatar_url TEXT,
  text TEXT NOT NULL,
  lang TEXT,
  posted_at TEXT,
  url TEXT NOT NULL,
  is_reply INTEGER NOT NULL DEFAULT 0,
  quoted_tweet_id TEXT,
  quoted_snapshot_json TEXT,
  raw_entities_json TEXT,
  raw_payload_json TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_x_posts_thread ON x_posts (thread_root_id, thread_index);

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  normalized_url TEXT NOT NULL UNIQUE,
  original_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  author TEXT,
  published_at TEXT,
  description TEXT,
  thumbnail_url TEXT,
  content_html TEXT,
  content_text TEXT,
  content_links_json TEXT,
  fetch_scope TEXT NOT NULL DEFAULT 'pending',   -- pending | full | partial | metadata_only | failed
  fetch_error TEXT,
  http_status INTEGER,
  fetched_at TEXT,
  ai_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_articles_domain ON articles (domain);

CREATE TABLE source_articles (
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  link_url TEXT NOT NULL,
  PRIMARY KEY (source_id, article_id)
);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  x_post_id TEXT REFERENCES x_posts(id) ON DELETE CASCADE,
  media_key TEXT,
  type TEXT NOT NULL,                            -- photo | video | animated_gif
  preview_url TEXT,
  media_url TEXT,
  alt_text TEXT,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  ai_ocr_text TEXT,                              -- P2
  ai_description TEXT,                           -- P2
  analysis_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_media_post ON media_assets (x_post_id);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,                     -- 正規化済み
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE tag_aliases (
  alias TEXT PRIMARY KEY,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE
);
CREATE TABLE source_tags (
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  added_by TEXT NOT NULL DEFAULT 'ai',           -- ai | user
  PRIMARY KEY (source_id, tag_id)
);
CREATE INDEX idx_source_tags_tag ON source_tags (tag_id);

CREATE TABLE enrichments (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  batch_id TEXT,
  kind TEXT NOT NULL,                            -- enrich | reenrich | kc_draft | relate | briefing | insight | echo | layout_naming
  lane TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL DEFAULT 0,
  few_shot_ids_json TEXT,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_enrichments_source ON enrichments (source_id, created_at DESC);

CREATE TABLE feedback_examples (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  field TEXT NOT NULL,                           -- category | info_type | tags
  input_digest TEXT NOT NULL,                    -- 本文冒頭300字 + 記事タイトル
  ai_value_json TEXT NOT NULL,
  user_value_json TEXT NOT NULL,
  embedding F32_BLOB(768),                       -- P2
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_feedback_vec ON feedback_examples (libsql_vector_idx(embedding, 'compress_neighbors=float1bit', 'max_neighbors=16'));

CREATE TABLE ai_usage_daily (
  day_pt TEXT NOT NULL,                          -- YYYY-MM-DD（America/Los_Angeles）
  lane TEXT NOT NULL,
  model TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  last_error TEXT,
  PRIMARY KEY (day_pt, lane, model)
);

-- 検索チャンク＋埋め込み（P2）
CREATE TABLE source_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  article_id TEXT REFERENCES articles(id) ON DELETE CASCADE,
  kc_id TEXT REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  embedding F32_BLOB(768),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id, article_id, kc_id, chunk_index)
);
CREATE INDEX idx_chunks_source ON source_chunks (source_id);
CREATE INDEX idx_chunks_vec ON source_chunks (libsql_vector_idx(embedding, 'compress_neighbors=float1bit', 'max_neighbors=32'));

CREATE TABLE media_embeddings (                 -- P2
  media_id TEXT PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  embedding F32_BLOB(768),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_media_vec ON media_embeddings (libsql_vector_idx(embedding, 'compress_neighbors=float1bit', 'max_neighbors=32'));

CREATE TABLE source_relations (                 -- P2
  id TEXT PRIMARY KEY,
  source_id_a TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  source_id_b TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,                        -- related | duplicate | contradicts | updates
  score REAL,
  detected_by TEXT NOT NULL DEFAULT 'ai',
  status TEXT NOT NULL DEFAULT 'proposed',       -- proposed | accepted | rejected
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id_a, source_id_b, relation),
  CHECK (source_id_a < source_id_b)
);
CREATE INDEX idx_relations_a ON source_relations (source_id_a, status);
CREATE INDEX idx_relations_b ON source_relations (source_id_b, status);

CREATE TABLE highlights (                       -- P2 Marginalia
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  target TEXT NOT NULL,                          -- post | article
  quote TEXT NOT NULL,                           -- 逐語
  prefix TEXT, suffix TEXT,                      -- 位置復元用（Text Fragment 相当）
  note TEXT,
  created_by TEXT NOT NULL DEFAULT 'user',       -- user | ai
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_highlights_source ON highlights (source_id);

CREATE TABLE knowledge_cards (                  -- P2
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  one_liner TEXT,
  ai_key_points_json TEXT,
  ai_claims_json TEXT,                           -- [{claim, evidence:[{source_id, quote}]}]
  ai_caveats_json TEXT,
  ai_draft_meta_json TEXT,
  my_meaning TEXT,
  my_application TEXT,
  my_next_actions TEXT,
  user_edited INTEGER NOT NULL DEFAULT 0,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',          -- draft | active | archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE kc_sources (
  kc_id TEXT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'evidence',         -- evidence | counter | context
  PRIMARY KEY (kc_id, source_id)
);
CREATE TABLE kc_relations (
  kc_id_a TEXT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  kc_id_b TEXT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'related',
  PRIMARY KEY (kc_id_a, kc_id_b),
  CHECK (kc_id_a < kc_id_b)
);

CREATE TABLE lenses (                           -- P2 スマートコレクション
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  query_text TEXT,                               -- 自然言語条件（埋め込み検索に使用）
  query_embedding F32_BLOB(768),
  filters_json TEXT NOT NULL DEFAULT '{}',       -- {category_ids, info_types, read_status, tags, since}
  min_score REAL NOT NULL DEFAULT 0.35,
  pinned INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE briefings (                        -- P2
  date_local TEXT PRIMARY KEY,                   -- YYYY-MM-DD（Asia/Tokyo）
  headline TEXT NOT NULL,
  sections_json TEXT NOT NULL,                   -- [{type, title, items:[{text, source_ids}]}]
  script_text TEXT NOT NULL,                     -- 読み上げ用プレーンテキスト
  model TEXT NOT NULL,
  opened_at TEXT,
  listened_seconds INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE insights (                         -- P2
  id TEXT PRIMARY KEY,
  week_start_local TEXT NOT NULL,
  kind TEXT NOT NULL,                            -- emerging_theme | bridge | stale | contradiction | streak
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  dismissed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_insights_week ON insights (week_start_local, dismissed);

CREATE TABLE recall_items (                     -- P2 Echo
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,                     -- source | kc
  target_id TEXT NOT NULL,
  question TEXT,
  interval_days INTEGER NOT NULL DEFAULT 7,
  ease REAL NOT NULL DEFAULT 2.5,
  due_at TEXT NOT NULL,
  last_result TEXT,                              -- agree | changed | drop
  times_shown INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (target_type, target_id)
);
CREATE INDEX idx_recall_due ON recall_items (active, due_at);
CREATE TABLE recall_events (
  id TEXT PRIMARY KEY,
  recall_item_id TEXT NOT NULL REFERENCES recall_items(id) ON DELETE CASCADE,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE source_layout (                    -- P2 Atlas
  source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  x REAL NOT NULL, y REAL NOT NULL,
  cluster_id INTEGER,
  computed_at TEXT NOT NULL
);
CREATE TABLE layout_clusters (
  id INTEGER PRIMARY KEY,
  label TEXT,
  size INTEGER NOT NULL,
  cx REAL, cy REAL,
  computed_at TEXT NOT NULL
);

CREATE TABLE qa_sessions (                      -- P2
  id TEXT PRIMARY KEY,
  title TEXT,
  filters_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE qa_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES qa_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                            -- user | assistant | tool
  parts_json TEXT NOT NULL,                      -- AI SDK UIMessage.parts
  citations_json TEXT,
  lane TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_qa_messages ON qa_messages (session_id, created_at);

CREATE TABLE push_subscriptions (               -- P2
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  keys_json TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_success_at TEXT,
  failures INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                            -- mcp | capture
  token_hash TEXT NOT NULL UNIQUE,               -- SHA-256
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  dedupe_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | running | done | failed | failed_permanent
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TEXT NOT NULL DEFAULT (datetime('now')),
  timeout_sec INTEGER NOT NULL DEFAULT 120,
  locked_by TEXT,
  started_at TEXT,
  finished_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_jobs_dequeue ON jobs (status, run_after, priority DESC, created_at);
CREATE UNIQUE INDEX idx_jobs_dedupe ON jobs (type, dedupe_key) WHERE status IN ('pending','running') AND dedupe_key IS NOT NULL;

CREATE TABLE job_schedules (
  key TEXT PRIMARY KEY,                          -- sync | folders | briefing | insights | echo | layout
  job_type TEXT NOT NULL,
  cron_expr TEXT NOT NULL,                       -- 5 フィールド
  tz TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT
);
INSERT INTO job_schedules (key, job_type, cron_expr) VALUES
  ('sync','sync_bookmarks','*/30 * * * *'),
  ('folders','sync_folders','15 3 * * *'),
  ('echo','schedule_echo','0 6 * * *'),
  ('briefing','build_briefing','0 7 * * *'),
  ('insights','build_insights','0 8 * * 0'),
  ('layout','compute_layout','30 4 * * 1');

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  x_account_id TEXT REFERENCES x_account(id) ON DELETE SET NULL, -- v3.2
  trigger TEXT NOT NULL,                         -- cron | manual | initial | client
  mode TEXT NOT NULL DEFAULT 'incremental',
  status TEXT NOT NULL,                          -- running | success | partial | failed
  new_sources INTEGER NOT NULL DEFAULT 0,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  resources_read INTEGER NOT NULL DEFAULT 0,
  est_cost_usd REAL NOT NULL DEFAULT 0,
  api_errors_json TEXT,
  rate_limit_remaining INTEGER,
  rate_limit_reset TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX idx_sync_runs_started ON sync_runs (started_at DESC);

-- 一覧・フィルタ用インデックス（rows read 抑制のため必須）
CREATE INDEX idx_sources_triage ON sources (triage_status, saved_at DESC, id);
CREATE INDEX idx_sources_filter ON sources (category_id, info_type, read_status, saved_at DESC, id);
CREATE INDEX idx_sources_saved ON sources (saved_at DESC, id);
CREATE INDEX idx_sources_x_post ON sources (x_post_id);
CREATE INDEX idx_sources_embed ON sources (embed_status, saved_at DESC);

-- FTS5（trigram。日本語・英語を同一トークナイザで扱う）
CREATE VIRTUAL TABLE sources_fts USING fts5(
  source_id UNINDEXED,
  post_text,
  article_title,
  article_text,
  ai_summary,
  user_note,
  tags,
  media_text,
  tokenize = 'trigram'
);
```

- FTS への反映はアプリ層で UPSERT（`DELETE ... WHERE source_id=?` → `INSERT`）。Source 保存・enrich・メモ更新・OCR 保存時に実行。
- Drizzle は `F32_BLOB` や `libsql_vector_idx` を直接表現できないため、該当部分は **カスタム SQL マイグレーション**（`drizzle-kit generate --custom`）で管理する。

---

## 20. エンティティ間の関係

```
settings (1)            x_account (0..1)
categories ──(parent_id)─┐
sources *──1 x_posts (kind=x_post)      x_posts 1──* media_assets ──0..1 media_embeddings
sources *──* articles (source_articles)
sources *──* tags (source_tags)         tags 1──* tag_aliases
sources 1──* enrichments
sources 1──* source_chunks              knowledge_cards 1──* source_chunks (kc チャンク)
sources 1──* highlights
sources *──* sources (source_relations)
sources 0..1─ source_layout            layout_clusters 1──* source_layout
sources 0..*─ feedback_examples
knowledge_cards *──* sources (kc_sources) ; knowledge_cards *──* knowledge_cards (kc_relations)
recall_items ─▶ sources | knowledge_cards ; recall_items 1──* recall_events
x_bookmark_folders 1──* x_post_folders ─▶ x_posts.tweet_id
briefings / insights ─▶ sources (source_ids_json)
qa_sessions 1──* qa_messages
jobs, job_schedules, sync_runs, ai_usage_daily, push_subscriptions, api_tokens（独立）
```

- Source : x_post = 1 : 1（ブックマーク 1 件）。スレッド展開の連投は `x_posts` のみ（Source なし）。
- `enrichments` は追記型。`sources` の AI カラムは最新採用値のキャッシュ。

---

## 21. API設計

Next.js Route Handlers ＋ Server Actions。**UI からの操作は Server Actions を優先**（型安全、楽観更新と相性が良い）。外部・機械アクセスは Route Handlers。

### 21.1 Route Handlers

| メソッド | パス | 概要 | 認証 | 優先 |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | 死活・最終同期・pending 件数・AI 予算残 | なし | P1 |
| GET | `/api/x/oauth/start` | X OAuth 開始 | なし | P1 |
| GET | `/api/x/oauth/callback` | コールバック | state | P1 |
| DELETE | `/api/x/connection` | 連携解除 | 同一オリジン | P1 |
| POST | `/api/sync` | 手動同期（60秒スロットル、`after()` で後続消化） | 同一オリジン | P1 |
| POST | `/api/jobs/tick` | ワーカー入口 | `CRON_SECRET`（Cron）／同一オリジン（client, 60秒制限） | P1 |
| GET | `/api/sources` | 一覧（フィルタ・カーソル `?cursor=saved_at,id&limit=30`） | 同一オリジン | P1 |
| GET | `/api/sources/:id` | 詳細（原文・記事・要約・タグ・関連） | 同一オリジン | P1 |
| GET | `/api/search` | `?q=&mode=keyword|hybrid&filters=` | 同一オリジン | P1（hybrid は P2） |
| GET | `/api/search/suggest` | 入力中サジェスト（FTS、上位 8） | 同一オリジン | P1 |
| GET | `/api/inbox/count` | 要確認件数（Badging 用） | 同一オリジン | P1 |
| GET | `/api/export?format=md|json` | エクスポート（ストリーミング zip） | 同一オリジン | P2 |
| POST | `/api/ask` | Ask（AI SDK UI stream） | 同一オリジン | P2 |
| POST | `/api/capture` | Quick Capture `{url?, text?, category_id?}` | `Bearer <capture token>` | P2 |
| GET/POST/DELETE | `/api/mcp` | MCP（Streamable HTTP） | `Bearer <mcp token>` | P2 |
| POST | `/api/push/subscribe` / DELETE | Push 購読 | 同一オリジン | P2 |
| GET | `/api/atlas` | 座標・クラスタ（`use cache`、週次） | 同一オリジン | P2 |
| GET | `/manifest.webmanifest` | PWA マニフェスト（`share_target` 含む） | なし | P1 |

### 21.2 Server Actions（`src/server/actions/*.ts`）

`confirmSource(id, {category_id?, info_type?, tags?})`, `archiveSource(id)`, `snoozeSource(id, until)`, `bulkConfirm(minConfidence)`, `updateSource(id, patch)`, `setReadStatus(id, status)`, `saveNote(id, note)`, `reenrich(id)`, `createHighlight(...)`, `categoryCreate/Update/Merge/Delete`, `lensCreate/Update/Delete`, `kcCreate/Update/Draft/Delete`, `recallAnswer(itemId, result)`, `settingsUpdate(patch)`, `tokenIssue(kind)`, `tokenRevoke(id)`, `briefingMarkOpened(date)`.

規約：入力は Zod で検証、返り値は `{ok:true, data} | {ok:false, error:{code,message}}`、成功時に `revalidateTag('sources' | 'today' | ...)`。

### 21.3 共通規約

- 一覧はカーソルページネーション（`saved_at DESC, id DESC`、`limit` 既定 30、最大 100）。**全件 SELECT 禁止**。
- エラー形：`{ error: { code, message, retryable } }`。
- 変更系はクライアント楽観更新＋失敗時ロールバック。
- `/api/jobs/tick` 以外の内部 API に同一オリジンチェック（`Origin`/`Sec-Fetch-Site`）。
- 任意の `APP_PASSCODE` が設定されているときは `proxy.ts` が全ページ／API（`/api/mcp`, `/api/capture`, `/api/jobs/tick`, `/api/health`, `/api/x/oauth/*` を除く）に Cookie セッションを要求。

---

## 22. 検索設計

### 22.1 キーワード検索（MVP）

- FTS5 `trigram`。クエリはスペース分割 → 各語を `"..."` で囲み AND 結合。**2 文字以下の語**は FTS に渡さず `sources` 側の `LIKE '%語%'`（`post_text`/`ai_summary`/`user_note`、直近 2,000 件に限定）で補助 **[仮定]**。
- ランキング：`bm25(sources_fts, 10.0, 8.0, 3.0, 5.0, 8.0, 6.0, 4.0)`（post_text, article_title, article_text, ai_summary, user_note, tags, media_text）。
- タグ・カテゴリ名の完全一致は最上位に固定。
- フィルタ（カテゴリ・情報タイプ・状態・タグ・期間）は `sources` へ JOIN して AND。
- サジェスト：`prefix*` 相当は trigram では不要（部分一致で十分）。上位 8 件。

### 22.2 意味検索（P2）

```sql
SELECT c.source_id, MIN(vector_distance_cos(c.embedding, vector32(:q))) AS d
FROM vector_top_k('idx_chunks_vec', vector32(:q), 60) AS t
JOIN source_chunks c ON c.rowid = t.id
GROUP BY c.source_id ORDER BY d LIMIT 30;
```

画像検索は `idx_media_vec` に対して同様（テキストクエリ → 画像埋め込み空間は Embedding 2 が共有）。

### 22.3 ハイブリッド（P2）

キーワード上位 50 と意味検索上位 50 を **RRF（k=60）** で統合。画像ヒットは同一 Source にマージ。フィルタは両方に適用。

### 22.4 Lens（P2）

`lenses.query_embedding` との距離 ≤ `1 - min_score` を満たす Source ∩ `filters_json`。一覧表示時に `vector_top_k(idx, q, 200)` → フィルタ → ページング。新着 Source の enrich 後に「該当 Lens」をバッジ表示（Today）。

### 22.5 性能目標

キーワード < 300ms、ハイブリッド < 900ms（クエリ埋め込み含む）。rows read：1 クエリあたり < 500 行。

---

## 23. Knowledge Card 生成方式

### 23.1 原則

AI フィールドとユーザー記述フィールドは別カラム。AI はユーザー欄に書かない。UI でも分離表示。

### 23.2 生成フロー

1. Source 選択（Reader「KC に追加」／Ask の回答から／Library の複数選択。関連候補を最大 10 提示）。
2. `kc_draft`（quality レーン）：title / one_liner / key_points / claims（各 claim に evidence: source_id + 逐語 quote）/ caveats。quote は原文に存在するか検証。
3. ユーザーが意味・活用・次アクションを記入。
4. 保存 → 対象 Source の `read_status='knowledged'`、KC チャンクを埋め込み、`recall_items` に登録（Echo 対象）。

### 23.3 更新

再生成は AI フィールドのみ。`contradicts` 関連があれば注意バナー。

---

## 24. Briefing / Echo / Insights 仕様

### 24.1 Daily Briefing（F-29）

- 生成：`build_briefing`（07:00 JST、quality 1 回）。入力：昨日（前回 Briefing 以降）の新規 Source の要約・カテゴリ、`contradicts/updates` 関連、直近 7 日のカテゴリ分布、未読の重要度 3。
- 出力（Zod）：`headline`（≤40字）、`sections`：`yesterday`（≤6 項目、各 ≤80 字 + source_ids）、`contradictions`（0〜2）、`themes`（1〜3、各 1 文）、`question_of_day`（1 問、Echo と連動可）、`script_text`（読み上げ用 400〜700 字、記号最小）。
- 新規 0 件の日：「昨日は保存なし。代わりに…」として未読の重要 Source 1 件を再提示（quality を消費せず、bulk 1 回で生成 **[仮定]**）。
- 配信：完成時に Push「今日の Briefing（3分）」。Today 最上部。
- 音声：`speechSynthesis`（`lang='ja-JP'`、`rate=1.1`）。バックグラウンド再生は保証しない。

### 24.2 Echo（F-30）

- 対象登録：`read_status ∈ {read, to_practice, practiced, knowledged}` になった Source、全 KC。初回 `due_at = +7日`。
- 選定：`schedule_echo`（06:00）で `due_at <= today` を最大 5 件、重要度・KC 優先。問いは bulk 1 回でまとめて生成（「この主張に今も同意しますか？」「これを実践しましたか？」「一言で言うと？」の型）。
- 反応と更新（簡易 SM-2）：`agree` → interval × ease（ease += 0.1、上限 3.0）、`changed` → interval = 3 日、関連 Source の提示と KC 更新提案、`drop` → `active=0`。
- 表示：Today の Echo カード（1 問）→「続ける」で SC-11。

### 24.3 Insights（F-31）

- 週次（日曜 08:00、quality 1 回）。入力：直近 4 週のカテゴリ／タグ推移、クラスタ変化（`source_layout`）、未読・未実践の滞留、矛盾。
- 種類：`emerging_theme`（今週増えた話題）、`bridge`（2 クラスタを繋ぐ Source）、`stale`（3 か月以上未読の重要 Source）、`contradiction`、`streak`（継続週数）。各 1〜3 件。
- Today に最大 3 枚、却下可。

---

## 25. MCPサーバー仕様

### 25.1 目的

自分の保存情報を Claude Desktop / Claude Code / Cursor / ChatGPT などの MCP クライアントから **検索・参照・追記** できるようにする。**AI 予算を消費しない**（検索・取得は DB のみ）。

### 25.2 実装

- `src/app/api/mcp/route.ts`：`createMcpHandler`（`mcp-handler` 2.x、MCP 仕様 2026-07-28、ステートレス Streamable HTTP）。`GET/POST/DELETE` をエクスポート。
- 認証：`withMcpAuth(handler, verifyToken, { required: true })`。`verifyToken` は `Authorization: Bearer` を SHA-256 して `api_tokens(kind='mcp', revoked_at IS NULL)` と定数時間比較。トークンは Settings で発行・再発行（表示は 1 回のみ）。
- OAuth 必須クライアント（ChatGPT コネクタ、Claude.ai Web）は P3（F-41）：`protectedResourceHandler` と外部認可サーバーで対応。Claude Desktop / Claude Code / Cursor は Bearer ヘッダー設定で接続できる（stdio 専用クライアントは `mcp-remote` 経由）。

### 25.3 ツール

| ツール | 入力 | 出力 |
| --- | --- | --- |
| `search_knowledge` | `{query, mode?: 'keyword'|'hybrid', category?, info_type?, read_status?, since?, k?≤20}` | `[{source_id, title, summary, author, url, saved_at, category_path, tags, score, snippet}]` |
| `get_source` | `{source_id, include_article?: bool}` | 原文・要約・記事本文（≤8,000字）・OCR・関連・ハイライト |
| `list_categories` | `{}` | 階層カテゴリ |
| `list_recent` | `{since, limit?}` | 新着 Source 要約 |
| `get_knowledge_card` / `list_knowledge_cards` | `{id}` / `{query?, limit?}` | KC |
| `create_knowledge_card` | `{title, one_liner?, my_meaning?, source_ids[]}` | 作成した KC（AI ドラフトは行わない） |
| `add_note` | `{source_id, note}` | 追記後の note |
| `set_read_status` | `{source_id, status}` | 更新結果 |
| `get_briefing` | `{date?}` | Briefing 本文 |

- Resources：`marginalia://source/{id}`、`marginalia://kc/{id}`（Markdown）。
- Prompts：`summarize_topic(topic)`（「保存情報から topic を要約せよ」テンプレート）。
- レート：60 req/分/トークン。応答は各 ≤ 50KB。

---

## 26. PWA・オフライン・プッシュ通知

- **マニフェスト**：`display: standalone`、`start_url: /today`、アイコン（maskable）、`share_target: { action: '/capture', method: 'GET', params: { title, text, url } }`（Android Chrome）。
- **Service Worker（Serwist）**：App Shell と静的資産はプリキャッシュ。`/api/sources*` は `StaleWhileRevalidate`（上限 200 エントリ、7 日）。Reader は直近閲覧 100 件を Runtime Cache。オフライン時は「オフライン」バナー＋読み取り専用。
- **iOS 注意**：Push・Badging は「ホーム画面に追加」した PWA のみ（iOS 16.4+）。Web Share Target 非対応 → **iOS ショートカット**（共有シート→「Marginalia に保存」→ `POST /api/capture` に Bearer）を Settings から導入案内（ショートカットの iCloud リンクを用意 **[仮定]**）。キャッシュは 7 日で消える前提。
- **Web Push**：`web-push`（VAPID）。イベント：Briefing 完成、Inbox ≥ しきい値（1 日 1 回）、`reauth_required`、同期失敗 6 時間超。`send_push` ジョブが送信、410/404 は購読削除。
- **Badging**：`navigator.setAppBadge(inboxCount)` を起動時と Inbox 更新時に。
- **Instant Navigations**：`next.config.ts` に `cacheComponents: true`, `experimental.partialPrefetching: true`。各タブの App Shell が URL 非依存になるよう `searchParams` 依存は Suspense 内へ。E2E に `instant()`。

---

## 27. エラー処理

| ID | エラー | 対応 | ユーザー通知 |
| --- | --- | --- | --- |
| E-01 | X API 429 | reset まで待機・再試行 | なし |
| E-02 | X トークン失効 | `reauth_required`、同期停止 | Today 赤ピル、Push |
| E-03 | X 5xx/ネットワーク | バックオフ→sync_runs 失敗 | 連続失敗で SC-09、6h 超で Push |
| E-04 | 削除/非公開 | availability 更新 | Reader バッジ |
| E-05 | 記事 404/410 | failed（恒久） | 記事セグメント |
| E-06 | 記事一時失敗 | 再試行 | 表示のみ |
| E-07 | ペイウォール/robots | metadata_only | 「概要のみ」 |
| E-08 | Gemini 429（日次） | レーンをクールダウン（太平洋 0 時まで）。**課金へ切替しない** | 予算メーター「本日分終了 · 17:00 に再開」 |
| E-09 | Gemini 429（分次）/5xx | 60s〜のバックオフ | なし |
| E-10 | AI スキーマ不一致 | バッチ 1 回再試行→各 Source を needs_review | Inbox「AI が整理できませんでした」 |
| E-11 | ジョブゾンビ | tick 冒頭で回収 | — |
| E-12 | Cron 未実行 | アプリ起動時 tick、最終同期監視 | Today に最終同期 |
| E-13 | X クレジット不足 | 同期停止 | ピル＋Push |
| E-14 | Turso 枠超過（BLOCKED） | 書き込み失敗検知、読み取り専用モード | 「DB 枠を確認」 |
| E-15 | MCP 認証失敗 | 401 + `WWW-Authenticate` | — |
| E-16 | Push 送信失敗 | 410/404 で購読削除、その他は再試行 3 回 | — |
| E-17 | 画像取得失敗（enrich 添付） | 画像なしで続行、`media.analysis_json.error` | — |

実装規約：外部呼び出しは `withRetry`。トークンをログに出さない。ユーザー文言は「何が起きたか＋次にできること」。

---

## 28. 運用上の注意（セキュリティ最小）

### 28.1 やること

- X トークン・API キーはサーバー環境変数または DB のサーバー専用カラムのみ。クライアントへ返さない。
- `/api/jobs/tick`（Cron）は `CRON_SECRET`。`/api/mcp`・`/api/capture` は **Bearer 必須**（`api_tokens` ハッシュ照合、定数時間比較、失効可能）。
- 内部 API・Server Actions は同一オリジンチェック。
- 記事 HTML は保存時サニタイズ。
- 任意 `APP_PASSCODE`：`proxy.ts` で Cookie セッション（HttpOnly、30 日）を要求。未設定なら完全オープン（v2.0 と同じ）。
- 依存更新は Renovate（週次、自動マージは patch のみ）。

### 28.2 やらないこと

アプリログイン/OTP/RLS/MFA、トークンの追加暗号化、WAF、IP 制限、監査ログ基盤、マルチテナント認可テスト。

---

## 29. プライバシー設計

### 29.1 外部 AI へ送るデータ

| 送信先 | 送るもの | 送らないもの |
| --- | --- | --- |
| Gemini API | 投稿本文・記事本文・画像・カテゴリ名/タグ名・ユーザー修正例（本文抜粋） | X トークン、内部 ID 以外の識別子、ユーザーメモ（既定では送らない。Ask で明示的に含める設定あり **[仮定]**） |

- **無料枠の注意**：Google AI Studio 無料利用は入力がプロダクト改善に使われる可能性がある。気になる場合は「AI 一時停止」または有料利用（Tier 1）へ。
- MCP 経由で外部クライアント（Claude 等）に渡るデータは、そのクライアントの規約に従う。Settings に注意文。

### 29.2 保存コンテンツ

私的アーカイブ。共有・公開機能なし。削除済み投稿は原文保持＋`deleted` 表示 **[仮定]**（設定でメタのみ可）。

### 29.3 ライフサイクル

| 操作 | 挙動 |
| --- | --- |
| エクスポート | Markdown（Obsidian 互換：frontmatter に出典 URL・タグ・カテゴリ）／JSON を zip ストリーミング |
| X 連携解除 | revoke → トークン削除。データ保持（選択で全削除） |
| 全データ削除 | 確認文字列入力後、主要テーブルを削除 |
| バックアップ | Turso PITR（Free 1 日）＋月次 JSON エクスポートをローカル保存（手動） |

---

## 30. 非機能要件

| 項目 | 目標 | 手段 |
| --- | --- | --- |
| 表示速度 | 主要画面 p75 < 1.2 秒（4G）、タブ間は instant | Cache Components、Partial Prefetching、カーソルページネーション、画像遅延 |
| 検索 | キーワード < 300ms、ハイブリッド < 900ms | FTS5 trigram、DiskANN |
| 同期 | 差分 < 30 秒、初回 5,000 件の取得 < 30 分（AI 整理は数日） | ページ上限、AI 分離 |
| AI 遅延 | 取り込み→分類 p90 < 15 分（予算内のとき） | tick 1〜5 分、coalesce |
| 可用性 | 個人利用で実用十分 | 再試行、アプリ起動時 tick、最終同期表示 |
| データ量 | 10 万 Source / 30 万チャンクまで現構成 | Turso 5GB（ベクトル約 1GB＋索引約 1GB） |
| コスト | インフラ/AI $0、X API ≤ $5/月 | AI 予算、スペンディングリミット |
| 保守性 | 単一リポジトリ、マイグレーション Git 管理、Biome | README・付録D |

---

## 31. テスト方針

| レイヤ | 対象 | ツール |
| --- | --- | --- |
| 単体 | 差分同期、URL 正規化、確信度分岐、FTS クエリ生成、RRF、AI 予算（PT 日付境界、429 解析）、SM-2、cron 評価 | Vitest 4 |
| 契約 | X API / Gemini レスポンスのフィクスチャ解析（Zod） | Vitest + msw |
| 統合 | ジョブ払い出し・再試行・ゾンビ回収・dedupe、FTS/vector クエリ | ローカル libSQL（`file:`） |
| AI 評価 | 分類品質：手ラベル 50 件で precision/recall。プロンプト変更時に再実行 | `pnpm eval:enrich` |
| E2E | Onboarding→同期→Inbox→検索→Reader、`instant()` によるナビゲーション回帰 | Playwright（X/Gemini はモック） |
| a11y | 主要画面の axe チェック | `@axe-core/playwright` |

---

## 32. 監視とログ

| 対象 | 手段 | 条件 |
| --- | --- | --- |
| 死活 | `/api/health` ＋ UptimeRobot（任意） | ダウン |
| 同期 | `sync_runs` / Today ピル / Push | 最終成功から 6 時間超 |
| ジョブ | pending 件数・最古 age | age > 1h |
| AI 予算 | `ai_usage_daily` / メーター | クールダウン頻発（週 3 回以上）→ キャップ見直し |
| X | Developer Console スペンディングリミット、`sync_runs.est_cost_usd` 月次合計 | 月 $5 超 |
| Turso | ダッシュボード rows/storage | 80% 超 |

ログ：構造化 JSON（`pino`）。本文・トークンは出さない。

---

## 33. コスト概算

前提：20 件/日、記事率 50%、画像率 30%。

| 項目 | MVP | P2 後 | 備考 |
| --- | --- | --- | --- |
| X API | $0.6〜1.5/月 | $1〜4/月（フォルダ・スレッド上限込み） | **唯一の定常有料** |
| Gemini bulk | $0（≤ 25 呼/日） | $0（≤ 60 呼/日） | Flash-Lite 500 RPD 内 |
| Gemini quality | — | $0（≤ 16 呼/日） | Flash 20 RPD 内 |
| Gemini embed | — | $0（≤ 300 呼/日） | Embedding 2 1,000 RPD 内 |
| Turso / Vercel / Cron / Push | $0 | $0 | 無料枠 |
| **合計（通常）** | **$1〜2/月** | **$1〜4/月** | |

暴走防止：X スペンディングリミット、AI 日次キャップ、記事入力 2,000 字、一覧 LIMIT、ベクトルは索引経由のみ。

---

## 34. 開発フェーズ

| フェーズ | 内容 | 完了条件 | 目安 |
| --- | --- | --- | --- |
| **Phase 0: 基盤** | リポジトリ、Next.js 16.3、Turso、Drizzle、全 DDL、Vercel（hnd1）、X App、Gemini キー、Cron、CI | 空 Today 表示、DB 接続、tick 疎通 | 2〜3 日 |
| **Phase 1: 収集** | X OAuth、同期、記事取得、jobs/tick、Onboarding | 実ブックマークが自動取り込み | 1.5〜2 週 |
| **Phase 2: AI＋UI（MVP）** | enrich_batch、AI 予算、Inbox、Library、Reader、検索、Today、Settings、Sync、PWA、Instant Navigations | 36 章 MVP 受け入れ | 2〜3 週 |
| **Phase 3: 知識化 I** | 埋め込み、ハイブリッド、Ask（生成UI）、Lens、学習する司書（注入）、マルチモーダル | Ask と Lens が動く | 2〜3 週 |
| **Phase 4: 押し出し** | Briefing、Echo、Insights、Push、Badging、フォルダ連動 | 朝の Briefing が届く | 2 週 |
| **Phase 5: 外部・俯瞰** | MCP、Quick Capture、Atlas、KC、Marginalia Reader、関連/矛盾、エクスポート、⌘K、スレッド展開 | Claude から検索できる、Atlas 表示 | 3 週 |
| **Phase 6: 将来** | 動画文字起こし、MCP OAuth | 未計画 | — |

---

## 35. 実装タスク分解（worker AI 向け）

各タスクは **1 PR** を目安。`依存` を満たしてから着手。`DoD`（Definition of Done）を満たし、付録F の規約に従う。並行可能なレーン：**A 基盤 / B 収集 / C AI / D UI / E 知識化 / F 押し出し / G 外部・俯瞰**。

### Phase 0（レーン A）

| ID | タスク | 主な成果物 | 依存 | DoD |
| --- | --- | --- | --- | --- |
| T-001 | Next.js 16.3 + TS + Tailwind v4 + shadcn/ui + Biome 初期化。`cacheComponents`/`partialPrefetching` 有効化 | `package.json`, `next.config.ts`, `src/app/layout.tsx`, `globals.css`（10.1 トークン） | — | `pnpm dev` で空 `/today` 表示、`pnpm lint`/`typecheck` 通過 |
| T-002 | Turso 接続、Drizzle 1.0 セットアップ | `src/db/client.ts`, `drizzle.config.ts` | T-001 | ローカル `file:` と本番 URL 両方で `SELECT 1` |
| T-003 | 19 章 DDL 全量をマイグレーションとして作成（vector/FTS はカスタム SQL）、初期 settings/カテゴリ/job_schedules seed | `drizzle/0000_init.sql`…, `src/db/schema.ts`, `src/db/seed.ts` | T-002 | 本番 DB に適用済み、`pnpm db:seed` 冪等 |
| T-004 | Vercel プロジェクトを **`x-idea.vercel.app`** に接続（Hobby、hnd1、Fluid）。GitHub `brutaldisco/x-idea` を Production にリンク。環境変数は付録D | `vercel.json`（`regions: ["hnd1"]`）, README | T-001 | `https://x-idea.vercel.app/api/health` が 200。カスタムドメイン追加は不要（`*.vercel.app` を使う） |
| T-005 | X Developer App（PKCE、callback=`https://x-idea.vercel.app/api/x/oauth/callback`）。**クレジット購入は人間作業**。未完了なら `x_api_enabled=0` のままモックで実装継続 | README 手順、付録H | — | キー設定済みなら連携テスト。未契約でも `MOCK_EXTERNAL=1` で T-101〜T-109 を完了できる |
| T-006 | Gemini API キー、AI Studio で実クォータ確認→ `ai_lane_caps_json` 初期値決定 | README | — | 3 レーン全モデルでテスト呼び出し成功 |
| T-007 | `/api/jobs/tick` スケルトン（CRON_SECRET、ゾンビ回収、schedule 評価、払い出しループ）＋ cron-job.org 登録 | `src/app/api/jobs/tick/route.ts`, `src/server/jobs/{queue,runner,schedule}.ts` | T-003 | 1 分間隔で tick が届き `job_schedules.last_run_at` が更新 |
| T-008 | CI（lint・型・Vitest・Playwright スモーク）、Renovate | `.github/workflows/ci.yml`, `renovate.json` | T-001 | PR で CI 緑 |
| T-009 | 共通基盤：ULID、`withRetry`、構造化ログ、エラー型、Zod ユーティリティ、同一オリジンチェック | `src/lib/*` | T-001 | 単体テスト |

### Phase 1（レーン B）

| ID | タスク | 成果物 | 依存 | DoD |
| --- | --- | --- | --- | --- |
| T-101 | X OAuth PKCE（start/callback/解除）、`x_account` 保存、Onboarding ステップ 2 | `src/app/api/x/oauth/*`, `src/server/x/oauth.ts` | T-003, T-005 | 実アカウントで連携・解除 |
| T-101b | X 複数アカウント（最大 3、v3.2）：`x_account` 複数行化、`sources.x_account_id`、`sync_runs.x_account_id`、アカウント別カーソル、Settings の一覧/追加/個別解除 | `drizzle/0001_multi_account.sql`, `src/server/x/*`, Settings UI | T-101 | 2 つ目のアカウントを追加・解除できる。既存データは最初の 1 件に帰属 |
| T-102 | トークンリフレッシュ、`reauth_required` 遷移（E-02） | `src/server/x/token.ts` | T-101 | 失効フィクスチャで状態遷移 |
| T-103 | X API クライアント（fields/expansions、レート制限記録、`withRetry`、Zod 解析） | `src/server/x/client.ts`, `fixtures/x/*.json` | T-009 | 契約テスト |
| T-104 | `sync_bookmarks`（差分／初回 `initial_limit`、errors→availability、`note_tweet`、sync_runs、コスト推定） | `src/server/jobs/handlers/syncBookmarks.ts` | T-007, T-103 | 実データ取り込み、既知 ID 打ち切り |
| T-105 | 投稿保存（x_posts/media/引用/URL 抽出/source_articles pending/FTS upsert） | `src/server/ingest/*` | T-104 | DB に全項目、FTS ヒット |
| T-106 | 手動同期 API（60 秒スロットル、`after()` で 3 ジョブ消化）、クライアント起動時 tick | `src/app/api/sync/route.ts` | T-104 | 連打で 429 |
| T-107 | `article_fetch`（正規化・robots・Readability・sanitize・scope・除外ドメイン） | `src/server/jobs/handlers/articleFetch.ts` | T-105 | 10 URL の scope が期待どおり |
| T-108 | Onboarding SC-13（ステップ 1,2,4,5。3 は P2） | `src/app/onboarding/*` | T-101 | 初回アクセスで表示、完了で `onboarding_done` |
| T-109 | Sync & Jobs SC-09（履歴、キュー、再試行） | `src/app/(tabs)/settings/sync/*` | T-104 | 失敗ジョブを UI から再試行 |

### Phase 2（レーン C＋D）

| ID | タスク | 成果物 | 依存 | DoD |
| --- | --- | --- | --- | --- |
| T-201 | AI 基盤：AI SDK 6 + `@ai-sdk/google`、レーン設定、`Output.object`、`ai_usage_daily` 予算ガード、429 解析、PT 日付 | `src/server/ai/{client,budget,lanes}.ts` | T-006, T-009 | 単体：キャップ到達・クールダウン・日付境界 |
| T-202 | `enrich_batch`（coalesce、プロンプト v3、Zod、後処理、タグ正規化、key_sentences 検証、enrichments 記録） | `src/server/jobs/handlers/enrichBatch.ts`, `src/server/ai/prompts/enrich.ts` | T-201, T-105 | 評価セット 50 件で precision ≥ 0.7 |
| T-203 | `feedback_examples` 蓄積（confirm/update 時の差分検出） | `src/server/actions/sources.ts` | T-202 | 修正で 1 行追加 |
| T-204 | Server Actions 一式（confirm/archive/snooze/bulk/update/readStatus/note/reenrich、revalidateTag） | `src/server/actions/*` | T-105 | 単体＋統合 |
| T-205 | Inbox SC-02（SwipeCard、候補チップ、迷い理由、Undo、一括、キーボード、`useOptimistic`） | `src/app/(tabs)/inbox/*`, `components/SwipeCard.tsx` | T-204 | 実機 375px で操作完結 |
| T-206 | Library SC-03（フィルタ、リスト/グリッド、カーソル無限スクロール、TanStack Query 永続化） | `src/app/(tabs)/library/*`, `/api/sources` | T-204 | rows read < 200/ページ |
| T-207 | Reader SC-06（ヒーロー ViewTransition、セグメント、原文/記事/要約、メモ、状態バー、再処理） | `src/app/source/[id]/*` | T-204 | A-04 目視、共有要素遷移 |
| T-208 | FTS 検索 `/api/search`（trigram、短語 LIKE、bm25 重み、フィルタ）＋ `/api/search/suggest` ＋ Ask SC-04（キーワードモード） | `src/server/search/keyword.ts`, `src/app/(tabs)/ask/*` | T-105 | 日本語 2/3/4 文字クエリでヒット |
| T-209 | Today SC-01（同期ピル、新着サマリー、Inbox チップ、最近。Briefing/Echo/Insights はプレースホルダ） | `src/app/(tabs)/today/*` | T-204 | `use cache` + Suspense、空状態 3 種 |
| T-210 | Settings SC-05（**外部サービス/課金トグル**、同期、AI レーン/キャップ/しきい値、除外ドメイン、表示、データ削除、エクスポート導線）。有料は既定 OFF | `src/app/(tabs)/settings/*` | T-204 | 付録H のトグルが UI に並ぶ。OFF の機能はジョブ未投入。worker はトグルを勝手に ON にしない |
| T-211 | Categories SC-08（階層 CRUD、統合） | `src/app/(tabs)/settings/categories/*` | T-204 | 統合で Source 再割当 |
| T-212 | PWA（Serwist、manifest、オフライン閲覧、インストール案内） | `src/app/sw.ts`, `manifest` | T-209 | Lighthouse PWA 合格、機内モードで直近閲覧可 |
| T-213 | Instant Navigations 適用と `instant()` E2E、`<Activity>` でタブ状態保持 | `tests/e2e/instant.spec.ts` | T-205〜T-210 | 5 タブすべて instant |
| T-214 | 任意 `APP_PASSCODE`（`proxy.ts`、Cookie セッション） | `src/proxy.ts` | T-001 | 未設定でオープン、設定で要求 |
| T-215 | 評価セット 50 件と `pnpm eval:enrich`、README（環境変数・運用手順・枠監視） | `eval/`, `README.md` | T-202 | S3 初期値記録 |

### Phase 3（レーン E）

| ID | タスク | 成果物 | 依存 | DoD |
| --- | --- | --- | --- | --- |
| T-301 | `embed_source`（チャンク化、Embedding 2 @768、`taskType`、バックフィル順序、`embed_status`） | `src/server/jobs/handlers/embedSource.ts` | T-201 | 1,000 RPD 内で新着が当日中に完了 |
| T-302 | 意味検索・ハイブリッド（`vector_top_k`、RRF、画像ヒット統合） | `src/server/search/{vector,hybrid}.ts` | T-301 | p95 < 900ms |
| T-303 | Ask RAG（`ToolLoopAgent`、ツール 3 種、`createAgentUIStreamResponse`、Source カード生成UI、追質問、音声入力、深く考えるトグル、qa_* 保存） | `src/server/ai/agents/ask.ts`, `src/app/api/ask/route.ts`, Ask UI | T-302 | 引用付き回答、根拠不足の明示 |
| T-304 | マルチモーダル enrich（画像取得・縮小・inline、OCR/説明、FTS `media_text`、画像埋め込み） | enrichBatch 拡張, `mediaEmbed` | T-202, T-301 | スクショ内の語で検索ヒット |
| T-305 | 学習する司書（`feedback_examples.embedding`、近傍 5 件をプロンプト注入、`few_shot_ids_json`） | enrichBatch 拡張 | T-203, T-301 | 注入あり/なしで評価差を記録 |
| T-306 | Lens（作成 UI、埋め込み、フィルタ、一覧、Today バッジ） | `src/app/(tabs)/library/lens/*` | T-302 | 自然言語 Lens が自動更新 |
| T-307 | X フォルダ連動（`sync_folders`、写像設定、enrich ヒント、Onboarding ステップ 3） | `syncFolders.ts`, Settings | T-104, T-202 | フォルダ写像で確定率上昇 |

### Phase 4（レーン F）

| ID | タスク | 成果物 | 依存 | DoD |
| --- | --- | --- | --- | --- |
| T-401 | Web Push（VAPID、購読、`send_push`、410 削除）、Badging | `src/server/push/*`, SW push handler | T-212 | iOS/Android 実機で受信 |
| T-402 | `build_briefing`（quality、Zod、0 件日の代替）、SC-10、`speechSynthesis`、Push 連携、Today カード | `buildBriefing.ts`, `src/app/briefing/*` | T-301, T-401 | 07:00 に生成、Push 到達 |
| T-403 | Echo（`recall_items` 登録、`schedule_echo`、問い生成、SM-2、SC-11、Today カード） | `scheduleEcho.ts`, `src/app/echo/*` | T-202 | 反応で due_at 更新 |
| T-404 | Insights（`build_insights`、5 種、Today 表示・却下） | `buildInsights.ts` | T-302 | 週次生成 |

### Phase 5（レーン G）

| ID | タスク | 成果物 | 依存 | DoD |
| --- | --- | --- | --- | --- |
| T-501 | MCP サーバー（`mcp-handler` 2.x、Bearer、ツール 9 種、Resources、Prompts、Settings でトークン発行） | `src/app/api/mcp/route.ts`, `src/server/mcp/*` | T-302 | Claude Desktop / Cursor から `search_knowledge` 成功 |
| T-502 | Quick Capture（`/api/capture`、SC-12、Android share_target、iOS ショートカット手順、`origin='manual'` の enrich） | `src/app/capture/*` | T-202 | 共有から Reader まで 2 タップ |
| T-503 | 関連・重複・矛盾（`relate_source`、Reader 関連セクション、矛盾バナー、Briefing 連携） | `relateSource.ts` | T-301 | 手作り矛盾ペアを検出 |
| T-504 | Knowledge Card（CRUD、`kc_draft`、SC-07、Ask から保存、Echo 登録） | `src/app/kc/*` | T-303, T-403 | AI 部と自分の記述の分離、再生成で保持 |
| T-505 | Marginalia Reader（`key_sentences` ハイライト、ユーザーハイライト/メモ、選択→質問、余白 UI） | Reader 拡張, `highlights` | T-207, T-303 | 選択→Ask に引き継ぎ |
| T-506 | Atlas（`compute_layout`：PCA→2D 近似＋k-means、クラスタ命名、`AtlasCanvas`、タイムスライダー、Lens 化） | `computeLayout.ts`, `src/app/(tabs)/library/atlas/*` | T-301 | 3,000 ノードで 60fps（PC） |
| T-507 | エクスポート（Markdown/Obsidian frontmatter、JSON、zip ストリーミング） | `/api/export` | T-204 | Obsidian で開ける |
| T-508 | コマンドパレット ⌘K（検索・移動・状態変更） | `components/CommandK.tsx` | T-208 | PC で主要操作到達 |
| T-509 | スレッド展開（`expand_thread`、コスト上限、Reader 連結表示、enrich 入力） | `expandThread.ts` | T-104 | 上限で停止、表示 |

---

## 36. 受け入れ条件

### MVP（Phase 0〜2）

| # | 条件 | 検証 |
| --- | --- | --- |
| A-01 | ブックマークが操作なしで要約・分類つきで現れる（既定 30 分＋AI p90 15 分、予算内） | 実機 10 件 |
| A-02 | 本文・投稿者・日時・URL・リンク・引用・メディア基本情報が保存される | DB＋UI |
| A-03 | 記事は取得可能範囲が UI に明示される | 10 URL |
| A-04 | AI 要約・原文・メモが視覚的に区別される（バッジ・色・ボーダー） | UI レビュー |
| A-05 | しきい値で auto_filed / needs_review が切り替わる | 設定変更試験 |
| A-06 | Inbox がスワイプ／1 タップ／キーボードで処理でき、Undo できる | 実機・PC |
| A-07 | ユーザー修正は再 enrich 後も保持され、`feedback_examples` に蓄積される | 再処理 |
| A-08 | 日本語 2〜4 文字クエリを含むキーワード検索が横断でき、フィルタできる | 実データ |
| A-09 | カテゴリ追加・改名・統合ができる | 操作 |
| A-10 | 削除/非公開を状態表示し同期は継続 | fixture＋実データ |
| A-11 | X 429・トークン失効・記事失敗・Gemini 日次 429 が 27 章どおりに動く | モック |
| A-12 | 375px 幅で主要操作が完結 | 実機 |
| A-13 | ログイン画面が存在せず、開いてすぐ使える（`APP_PASSCODE` 未設定時） | UI |
| A-14 | X トークン・API キーがクライアント応答・ログに出ない | レビュー |
| A-15 | AI 予算メーターが実使用と一致し、キャップ到達で自動先送りされる | 1 日の実測 |
| A-16 | 5 タブのナビゲーションが instant（`instant()` テスト pass） | E2E |
| A-17 | PWA としてインストールでき、直近閲覧がオフラインで読める | 実機 |
| A-18 | 1 週間の実測でインフラ/AI $0、X API が想定内 | ダッシュボード |

### P2（Phase 3〜5、抜粋）

- Ask の回答に引用がつき、Source カードがインライン表示され、根拠不足を明示する。
- 画像内の文字で検索ヒットする。
- 朝 07:00 台に Briefing が生成され Push が届き、音声で聞ける。
- Echo の反応で次回間隔が変わる。
- Claude Desktop から `search_knowledge` が使える。
- Atlas でクラスタが表示され、タップで一覧に絞り込める。
- KC で AI 部と自分の記述が分離され、再生成で消えない。
- エクスポート Markdown に出典 URL が含まれる。

---

## 37. リスクと未確定事項

| ID | リスク/未確定 | 影響 | 対策 |
| --- | --- | --- | --- |
| R-01 | X API 料金・仕様変更 | コスト増・停止 | 月次で docs 確認。リミット必須 |
| R-02 | X App 停止 | 収集停止 | 公式 API のみ。データは Turso に残る |
| R-03 | ブックマーク履歴の遡及限界 | 初回欠落 | 取得範囲を UI 明示、Quick Capture |
| R-04 | **Gemini 無料枠の再縮小／モデル ID 変更** | AI 停止 | レーン・モデル・キャップを設定化、AI 一時停止、有料オプション |
| R-05 | 記事取得ブロック増 | metadata_only 増 | 投稿本文だけで enrich 成立 |
| R-06 | 分類精度不足 | Inbox 肥大 | description 整備、学習する司書、しきい値 |
| R-07 | FTS5 trigram の日本語品質（表記揺れ） | 検索漏れ | NFKC 正規化、意味検索併用 |
| R-08 | Turso Free の rows read / storage 超過 | DB ブロック | INDEX、LIMIT、`vector_top_k` 必須、float1bit 圧縮 |
| R-09 | Vercel Hobby の実行時間（300 秒） | ジョブ中断 | ジョブ細分化、tick で複数回消化 |
| R-10 | ブックマーク時刻が API から取れない | 並びが近似 | `saved_at` 代用 |
| R-11 | Next.js 16.3 Instant Navigations の制約（URL 依存 shell） | 開発コスト | `searchParams` 依存は Suspense 内、`instant()` テスト |
| R-12 | iOS PWA 制約（Push は追加後のみ、Share Target 非対応、7 日キャッシュ） | 体験差 | インストール案内、iOS ショートカット |
| R-13 | デプロイ URL 漏洩 | 第三者閲覧 | 任意 `APP_PASSCODE`。MCP/Capture は Bearer |
| R-14 | Drizzle 1.0 が RC の期間 | 破壊的変更 | バージョン固定、SQL マイグレーションは手書き優先 |
| R-15 | `mcp-handler` 2.x と MCP 仕様改定 | クライアント非互換 | 2025 系フォールバックあり。OAuth は P3 |
| R-16 | Embedding 2 の日本語検索品質 | 意味検索精度 | 評価セットで確認、次元 1536 へ切替可能（再埋め込み要） |

---

## 38. 将来拡張

| 拡張 | 受け皿 | 追加実装 |
| --- | --- | --- |
| 動画文字起こし | `media_assets.analysis_json` | 音声抽出＋（有料）文字起こし |
| MCP OAuth（ChatGPT / Claude.ai Web） | `protectedResourceHandler` | 外部認可サーバー |
| 他収集源（RSS、はてブ、Kindle ハイライト） | `sources.origin` | fetch ジョブ追加 |
| ローカル埋め込みレプリカ | Turso embedded sync | オフライン検索 |
| 有料 AI 切替（Anthropic / OpenAI / AI Gateway） | `ai_models_json` | プロバイダアダプタ |
| 音声 Briefing の高品質化 | `briefings.script_text` | Gemini TTS（有料） |

**明示的にやらない**：マルチユーザー SaaS 化、強い認証基盤、X への投稿（$0.20/URL 付き投稿）。

---

## 付録A：仮定一覧

| # | 仮定 | 既定値 | 根拠 |
| --- | --- | --- | --- |
| P-01 | 取り込み規模 | 20 件/日（ピーク 50）、初回 ≤ 5,000 | 見積り基準 |
| P-02 | 同期間隔 | 30 分 | 鮮度と X コスト |
| P-03 | 返信ブックマーク | 保存（設定で除外可） | 柔軟性 |
| P-04 | 自動確定しきい値 | 0.80 | 運用で調整 |
| P-05 | bulk モデル | `gemini-3.5-flash-lite` | 無料枠 500 RPD |
| P-06 | quality モデル | `gemini-3.6-flash` | 無料枠 20 RPD |
| P-07 | 埋め込み | `gemini-embedding-2` @768 | 無料枠 1,000 RPD、容量 |
| P-08 | レーン日次キャップ | bulk 400 / quality 16 / embed 800 | 実測の 80% |
| P-09 | enrich バッチ | 最大 5 件（画像ありは 2 件） | 出力品質と RPD の均衡 |
| P-10 | 削除済み原文 | 保持（設定でメタのみ可） | 学習記録優先 |
| P-11 | メディア実体 | X CDN 参照＋enrich 時のみ一時取得 | 簡素化 |
| P-12 | ブックマーク時刻 | 初回観測時刻 | API 制約 |
| P-13 | 引用 | 1 階層スナップショット | ノイズ抑制 |
| P-14 | アプリ認証 | なし | 個人用途 |
| P-26 | X 連携アカウント数 | 最大 3（v3.2） | ユーザー要望。アプリのユーザー概念は追加しない |
| P-15 | 初期カテゴリ | 社会学/AI/組織/デザイン/筋力トレーニング/健康/仕事/思想 | 要件例示 |
| P-16 | Cron | cron-job.org 1 分 | Hobby 制約回避 |
| P-17 | `APP_PASSCODE` | 未設定 | 最小セキュリティ |
| P-24 | 本番 URL | `https://x-idea.vercel.app` | ユーザー指定（2026-09-04） |
| P-25 | 有料トグル | すべて OFF | 契約遅延でも実装継続 |
| P-18 | フォルダ写像のヒント加点 | +0.15 | 運用で調整 |
| P-19 | 短語検索 | 2 文字以下は LIKE（直近 2,000 件） | trigram 制約 |
| P-20 | 0 件日の Briefing | bulk で代替生成 | quality 節約 |
| P-21 | ユーザーメモの AI 送信 | 既定 送らない | プライバシー |
| P-22 | iOS ショートカット | 配布リンクを README に用意 | Share Target 非対応 |
| P-23 | Atlas 次元削減 | PCA→2D（＋軽量 UMAP 近似） | サーバー計算コスト |

## 付録B：AIプロンプト設計

### B.1 enrich_batch（`PROMPT_VERSION = 'enrich-v3.0'`）

```
system:
あなたは個人用ナレッジデータベース「Marginalia」の司書である。入力された複数の X 投稿
（および添付画像・リンク先記事）を、ユーザーの既存分類体系に従って整理する。
規則:
1. 要約は日本語 3 行以内（160 字以内）。原文にない情報・意見を加えない。
2. カテゴリは提示された既存カテゴリ ID から選ぶ。適合が弱い場合は null とし
   new_category_suggestion に提案を書く。勝手に新設しない。
3. 迷ったときは uncertainty_reason に「何と何の間で迷ったか」を 40 字以内で書く。
4. タグは既存タグを優先。新規タグは一般名詞に正規化（1〜5 個、日本語または英語小文字）。
5. confidence は「同じ入力を 10 回分類したとき同じ結果になる確率」の見積り。
6. key_sentences は原文（投稿または記事）からの逐語抜き出し。言い換え禁止。最大 3。
7. 画像がある場合、読める文字は ocr_text に逐語で、内容は description に 1 文で。
8. 「過去の修正例」がある場合は、その傾向を最優先で反映する。
9. X フォルダのヒントがある場合、そのカテゴリが妥当なら優先する。
10. 出力は JSON スキーマに厳密に従う。items の順序と source_id は入力どおり。

user:
## 既存カテゴリ（id: パス — 説明）
{category_tree}
## 既存タグ（頻出上位 100）
{tags}
## 情報タイプ定義
theory=理論・概念 / method=方法・考え方 / procedure=手順 / research=研究・データ /
case=事例 / opinion=意見 / counter=反論 / tool=ツール / quote=引用・名言 /
idea=アイデア / news=ニュース / resource=まとめ・リンク集
## 過去の修正例（類似順、最大 5）           ← P2
- 入力抜粋: ... / AI: 社会学/理論 → ユーザー: 思想
## 対象（{n} 件）
### source_id: {id}
author: {author_name} (@{username}) posted_at: {posted_at}
folder_hint: {folder → category path | なし}   ← P2
text: {text}
quoted: {引用投稿 | なし}
thread: {連投本文 | なし}                          ← P2
article: title / author / 本文先頭 2,000 字 | なし
images: [image_1, image_2]（添付）                 ← P2
```

### B.2 ask（`ask-v1.0`）

```
あなたはユーザーの保存情報（X ブックマーク・記事・ナレッジカード）だけを根拠に答える
リサーチアシスタントである。
- 必ず searchKnowledge ツールで検索してから答える。必要なら getSource で全文を読む。
- 根拠は文末に [n] で示し、n は取得した Source の番号。
- 保存情報に根拠がない場合は「保存情報には見つかりませんでした」と明言する。
- 一般知識で補足する場合は「（一般知識）」と明示し、根拠つきの記述と段落を分ける。
- 日本語で簡潔に。箸休めの前置きは不要。
- 最後に、次に聞くとよい質問を 3 つ、1 行ずつ提案する（"## 次の質問" 見出し）。
```

### B.3 briefing（`briefing-v1.0`）

```
あなたはユーザーの朝 3 分の Briefing を書く編集者である。入力は昨日保存された情報の要約、
検出された矛盾・更新、直近 7 日のテーマ分布、未読の重要情報。
- headline は 40 字以内で「今日いちばん考える価値のあること」。
- yesterday は最大 6 項目、各 80 字以内、必ず source_ids を付ける。
- contradictions は 0〜2 件。「A は…と言うが、B は…」の形。
- themes は 1〜3 件、各 1 文。
- question_of_day は yes/no で答えられる問いを 1 つ。
- script_text は音声読み上げ用。400〜700 字、記号・URL・括弧を使わない、固有名詞は読みやすく。
- 保存情報にないことを書かない。
```

### B.4 kc_draft（`kc-v1.0`）

```
複数の Source から Knowledge Card のドラフトを作る。
- title（30 字以内）、one_liner（60 字以内）。
- key_points 3〜6。
- claims: 各 claim に evidence を 1 つ以上。evidence.quote は Source 原文からの逐語。
- caveats: 反論・限界・前提を 1〜3。
- ユーザーの意味づけ・活用・次アクションの欄には一切書かない。
```

### B.5 echo_questions / cluster_naming / insights

- echo：対象 5 件それぞれに「今も同意するか」「実践したか」「一言で言うと」のいずれかの型で 1 問（40 字以内）。
- cluster_naming：クラスタ内の代表要約 10 件から 12 字以内のラベルと 1 文の説明。
- insights：5 種のうち該当するものを最大 6 件、各 title 24 字以内・body 120 字以内・source_ids 必須。

## 付録C：フリーミアム枠の前提（2026-09 実測）

数値は変動しうる。実装・運用時にダッシュボードで必ず再確認すること。

| サービス | プラン | 上限（確認日 2026-09-04） | 本アプリの使い方 | 注意 |
| --- | --- | --- | --- | --- |
| Turso | Free | 100 DB / 5GB / 500M rows read / 10M rows written / 月、PITR 1 日 | 正本 DB、FTS、vector、jobs | **超過でブロック**。INDEX 必須 |
| Vercel | Hobby | Functions 300 秒、Fluid compute、Cron は日次、Workflows 5 万イベント/月 | Next.js ホスト | 商用不可。高頻度 Cron は外部 |
| Gemini API | Free | 2026-09-02 実測：`gemini-3.6-flash` 5 RPM/20 RPD、`gemini-3.5-flash-lite` 15 RPM/500 RPD、`gemini-embedding-2` 100 RPM/1,000 RPD（公式は公表せず、AI Studio で確認） | enrich・embed・Ask・Briefing | 無料枠入力はプロダクト改善に使われうる。Prepay/Postpay 課金は 2026-03-23 以降 |
| X API | Pay-per-use | Owned Reads $0.001/リソース、Post read $0.005、bookmarks 180 req/15 分、24h 重複排除 | ブックマーク・フォルダ取得 | **唯一の定常課金**。リミット必須 |
| cron-job.org | Free | 1 分間隔 | tick | シークレットはヘッダーで |
| Web Push | — | APNs/FCM 無料 | 通知 | iOS は追加後のみ |

## 付録D：環境変数一覧

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | ✓ | `libsql://x-idea-brutaldisco.aws-ap-northeast-1.turso.io`（ローカルは `file:local.db`） |
| `TURSO_AUTH_TOKEN` | ✓（本番） | Turso 認証トークン |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | ✓ | X Developer App（PKCE。Confidential client の場合は secret） |
| `X_REDIRECT_URI` | ✓ | `https://x-idea.vercel.app/api/x/oauth/callback`（ローカルは `http://localhost:3000/api/x/oauth/callback`） |
| `GEMINI_API_KEY` | ✓ | Google AI Studio（無料キーで開始。有料は Settings トグル） |
| `CRON_SECRET` | ✓ | `/api/jobs/tick` 用 |
| `APP_URL` | ✓ | **`https://x-idea.vercel.app`**（Push・MCP・OAuth の絶対 URL） |
| `SESSION_SECRET` | ✓ | OAuth state Cookie / APP_PASSCODE セッションの署名 |
| `APP_PASSCODE` | 任意 | 設定時のみ全ページに要求 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | P2 | Web Push。契約不要。`npx web-push generate-vapid-keys` |
| `ANTHROPIC_API_KEY` | 任意 | 有料トグル OFF のあいだ未使用 |
| `OPENAI_API_KEY` | 任意 | 有料トグル OFF のあいだ未使用 |
| `SENTRY_DSN` | 任意 | `observability_json.sentry` が true のときだけ初期化 |
| `ARTICLE_FETCH_UA` | 任意 | 既定 `MarginaliaBot/1.0 (+mailto:...)` |
| `MOCK_EXTERNAL` | 開発 | `1` で X/Gemini を msw モック |
| `LOG_LEVEL` | 任意 | `info` |

MCP / Capture トークンは環境変数ではなく `api_tokens` テーブル（Settings で発行）。

## 付録E：リポジトリ構成

```
x-idea/
├─ 実装設計書_Xブックマーク・ナレッジベース.md   ← 本書（v3.0）
├─ docs/
│   ├─ archive/実装設計書_v2.0_2026-08-11.md
│   └─ decisions/ADR-*.md                       ← 設計判断の追記（worker AI が作成）
├─ AGENTS.md                                    ← worker AI 向け入口
├─ README.md                                    ← セットアップ・運用手順
├─ package.json / pnpm-lock.yaml / biome.json / tsconfig.json
├─ next.config.ts / vercel.json / drizzle.config.ts
├─ drizzle/                                     ← SQL マイグレーション
├─ public/ (icons, manifest)
├─ eval/ (enrich 評価セット 50 件)
├─ fixtures/ (x/*.json, gemini/*.json)
├─ tests/ (unit, integration, e2e)
└─ src/
    ├─ app/
    │   ├─ (tabs)/{today,inbox,library,ask,settings}/     ← 下部タブ
    │   ├─ source/[id]/  kc/[id]/  briefing/[date]/  echo/  capture/  onboarding/
    │   ├─ api/{health,sync,jobs/tick,sources,search,inbox,export,ask,capture,mcp,push,x/oauth}/
    │   ├─ layout.tsx / globals.css / sw.ts / manifest.ts
    ├─ proxy.ts                                 ← APP_PASSCODE ゲート
    ├─ components/{ui,features}/
    ├─ db/{client.ts,schema.ts,seed.ts}
    ├─ server/
    │   ├─ actions/      ← Server Actions
    │   ├─ x/            ← OAuth, client, sync
    │   ├─ fetch/        ← article fetch
    │   ├─ ai/{client,budget,lanes,prompts,agents}/
    │   ├─ search/{keyword,vector,hybrid,lens}.ts
    │   ├─ jobs/{queue,runner,schedule,handlers/*}.ts
    │   ├─ mcp/          ← tools, auth
    │   └─ push/
    └─ lib/              ← ulid, retry, logger, errors, zod utils
```

## 付録F：worker AI 向け実装ガイド

1. **入口**：`AGENTS.md` → 本書 35 章で担当タスクを選ぶ → 該当章（画面なら 8・10 章、DB なら 19 章、AI なら 16 章・付録B）を読む。
2. **ブランチ／PR**：`feat/T-xxx-短い説明`。1 タスク 1 PR。PR 本文にタスク ID、DoD のチェックリスト、スクリーンショット（UI）を含める。
3. **設計と実装が食い違ったら**：実挙動（API の実レスポンス、実クォータ）を正とし、本書の該当箇所と `docs/decisions/ADR-xxx.md` を **同じ PR で** 更新する。特に 14 章・16.2・付録C。
4. **やってはいけないこと**：`user_id` の追加、ログイン UI の追加、全件 SELECT、`vector_distance_cos` によるフルスキャン、AI 429 時の有料切替、**有料トグル（`x_api_enabled` / `ai_paid_enabled` / `thread_expand_enabled` / `paid_providers_json`）を人間の指示なしに ON にする**、原文カラムの書き換え、ユーザー記述カラムへの AI 書き込み、トークンのログ出力。
5. **コーディング規約**：TypeScript strict、Biome 既定、Server Actions は Zod 入力検証＋`{ok, data|error}`、DB アクセスは `src/server/*` のみ（コンポーネントから直接叩かない）、時間は UTC ISO 保存・表示時に `Asia/Tokyo`、AI 呼び出しは必ず `budget.guard(lane)` 経由。
6. **テスト**：単体はロジック（同期打ち切り、予算、SM-2、RRF、cron）。統合はローカル libSQL。E2E は msw でX/Gemini をモック。UI 変更は `instant()` を壊さない。
7. **コミット**：Conventional Commits（`feat:`, `fix:`, `docs:`, `chore:`）。
8. **完了報告**：PR 説明に「本書のどの受け入れ条件（A-xx）に寄与するか」を明記。
9. **困ったら**：付録A の仮定に従って進め、仮定を追加した場合は付録A に追記する。

## 付録G：用語集

| 用語 | 意味 |
| --- | --- |
| Source | 保存単位。X 投稿 1 件（＋リンク先記事）または手動取り込み |
| Knowledge Card（KC） | 複数 Source から自分の言葉で構築した知識 |
| Inbox / トリアージ | AI が確信を持てなかった Source を確認・確定する場所 |
| レーン（bulk / quality / embed） | 用途別の AI モデル・予算の区分 |
| AI 予算 | レーン別の日次リクエスト上限管理 |
| 学習する司書 | ユーザー修正を few-shot として再利用する仕組み |
| Briefing | 毎朝 1 本の要約・矛盾・テーマ報告 |
| Echo | 間隔反復で古い Source/KC を問いとして再提示する機能 |
| Insights | 週次の気づき（新興テーマ・橋渡し・滞留・矛盾・継続） |
| Lens | 自然言語条件＋フィルタで自動更新される仮想コレクション |
| Atlas | 埋め込みクラスタの 2D 俯瞰図 |
| Marginalia（機能） | Reader の余白に AI／ユーザーがハイライト・注釈を書く機能 |
| MCP | Model Context Protocol。外部 AI クライアントから本アプリのツールを呼ぶ標準 |
| Quick Capture | 共有シート／ショートカットから任意 URL を取り込む機能 |
| tick | 外部 Cron またはクライアントから叩かれるワーカー実行 1 回 |
| 有料トグル | Settings の課金スイッチ。既定 OFF。契約完了後に人間が ON |

## 付録H：アカウント・契約チェックリスト

実装は契約待ちで止めない。**有料はすべて Settings トグル既定 OFF**。未契約の間は `MOCK_EXTERNAL=1` と無料枠で進める。worker AI はトグルを勝手に ON にしない。

本番 URL は **`https://x-idea.vercel.app`**。X OAuth の callback もここを使う。

### H.1 今すぐ人間がやること（無料／即日）

| # | サービス | 作業 | 料金 | アプリ側トグル | 未完了でも実装できるか |
| --- | --- | --- | --- | --- | --- |
| H-01 | **GitHub** `brutaldisco/x-idea` | リポジトリは作成済み。実装者（例: `takashinat`）に **Write** を付与し、設計書コミットを `main` に push | $0 | — | ローカル実装は可。CI / Vercel Git 連携は Write 必須 |
| H-02 | **Vercel**（Hobby） | ① `vercel login` ② プロジェクト名 `x-idea` ③ GitHub `brutaldisco/x-idea` を Production に接続 ④ リージョン **hnd1** ⑤ ドメインは自動の **`x-idea.vercel.app`**（追加購入不要）⑥ 付録D の環境変数を Production / Preview に設定 | $0（Hobby、個人非商用） | — | ローカル `pnpm dev` は可。本番疎通は必須 |
| H-03 | **Turso** | DB は作成済み（`libsql://x-idea-brutaldisco.aws-ap-northeast-1.turso.io`）。**Auth Token** を発行し、Vercel の `TURSO_AUTH_TOKEN` / `TURSO_DATABASE_URL` に入れる。ダッシュボードで rows read / storage を月次確認 | $0（Free） | — | ローカルは `file:local.db` で可 |
| H-04 | **Google AI Studio** | プロジェクト作成 → API キー発行 → **Rate limits 画面で実クォータを記録** → `GEMINI_API_KEY` を Vercel に設定。課金アカウントは作らない（有料トグル OFF） | $0 | `ai_paid_enabled=OFF` | キーなしでも `MOCK_EXTERNAL=1` で UI/ジョブ実装可 |
| H-05 | **cron-job.org**（または GitHub Actions `schedule`） | `POST https://x-idea.vercel.app/api/jobs/tick`、ヘッダー `Authorization: Bearer <CRON_SECRET>`、間隔 1〜5 分。シークレットを URL に載せない | $0 | — | アプリ起動時 tick で代替可。本番の定期同期には必要 |
| H-06 | **Vercel 環境変数** | 付録D をすべて登録。最低限: `TURSO_*`, `GEMINI_API_KEY`, `CRON_SECRET`, `APP_URL=https://x-idea.vercel.app`, `SESSION_SECRET`, `X_*`（未発行なら空で Preview のみ） | $0 | — | キー欠落時は該当機能を OFF のまま |
| H-07 | **VAPID**（P2） | `npx web-push generate-vapid-keys` をローカルで実行し、3 変数を Vercel に設定。外部契約なし | $0 | 通知トグル（P2、既定 OFF） | Phase 4 まで不要 |

### H.2 契約・審査が必要（すぐできないことがある）

| # | サービス | 作業 | 料金 | アプリ側トグル（既定） | 未完了時の挙動 |
| --- | --- | --- | --- | --- | --- |
| H-10 | **X Developer Portal** | ① developer.x.com で開発者アカウント（審査・待ちがあり得る）② Project + App ③ User authentication: OAuth 2.0 PKCE、Callback `https://x-idea.vercel.app/api/x/oauth/callback`、Scopes `bookmark.read tweet.read users.read offline.access` ④ **クレジット購入** ⑤ **スペンディングリミット**（推奨 $10） | 従量。Owned Reads $0.001/リソース。初回 5,000 件で約 $5。通常月 $1〜4 | **`x_api_enabled=OFF`** | 同期ジョブを投入しない。Today に「X API のクレジット設定が必要」。T-101〜T-109 は msw モックで完了させる |
| H-11 | **Gemini 有料（Tier 1）** | AI Studio で課金アカウントをリンク。無料枠入力が学習利用されるのが嫌なとき、または RPD 不足のときだけ | 従量。月額上限 `$5` を Settings で設定 | **`ai_paid_enabled=OFF`** | 無料枠のみ。429 はクールダウン。**自動で有料に切替しない** |
| H-12 | **X スレッド展開** | H-10 完了後。追加で Post read $0.005/投稿 | 月上限 `$2`（Settings） | **`thread_expand_enabled=OFF`** | ジョブ未投入。Reader に「スレッド未取得」 |
| H-13 | **Anthropic / OpenAI** | 各社で API キー取得・課金設定。`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` を Vercel に追加 | 従量 | **`paid_providers_json` 両方 false** | プロバイダ選択肢を Settings で無効表示 |
| H-14 | **Turso Developer** | Free の rows/storage が 80% を超えたら検討 | $4.99〜/月 | インフラ側。アプリトグルなし | 超過時は読み取り専用バナー（E-14） |
| H-15 | **Vercel Pro** | Hobby の Functions / 商用制限に当たったら検討。Workflows を主系にするならここ | $20/月 | インフラ側。アプリトグルなし | 現状は Hobby で足りる前提 |
| H-16 | **Sentry / UptimeRobot** | 任意。Sentry は DSN を環境変数に。UptimeRobot は `https://x-idea.vercel.app/api/health` を 5 分間隔 | 各無料枠あり | **`observability_json` 両方 false** | 監視なしでも MVP 可 |

### H.3 契約不要・後回しでよいもの

| 項目 | 理由 |
| --- | --- |
| 独自ドメイン（`marginalia.example` 等） | `x-idea.vercel.app` を使う。DNS / 証明書の追加契約は不要 |
| Apple Developer / Google Play | ネイティブアプリは作らない。PWA |
| MCP OAuth（ChatGPT / Claude.ai Web） | P3。Claude Desktop / Cursor は Bearer で足りる |
| Gemini TTS | 端末の `speechSynthesis` で代替。有料 |
| Cloudflare / 別キュー基盤 | 不採用 |

### H.4 接続手順（Vercel → `x-idea.vercel.app`）

ローカルの Vercel CLI トークンが無効な場合、**人間がブラウザで**次を行う（worker は代行できない）。

1. [vercel.com](https://vercel.com) にログイン（Hobby）。
2. Add New → Project → Import `brutaldisco/x-idea`（H-01 の Write が必要）。
3. Project Name を **`x-idea`** にする。これで本番 URL は `https://x-idea.vercel.app`。
4. Framework Preset: Next.js。Root: `/`。Build: `pnpm build`。Install: `pnpm install`。
5. Project Settings → Functions → Region **`hnd1`（Tokyo）**。`vercel.json` の `regions: ["hnd1"]` と一致させる。
6. Settings → Environment Variables に付録D を登録。`APP_URL=https://x-idea.vercel.app`。
7. Settings → Git で Production Branch = `main`。
8. 初回デプロイ後、`https://x-idea.vercel.app/api/health` が 200 になること（T-004 の DoD）。
9. X Developer App の Callback / Website URL に `https://x-idea.vercel.app` を登録（H-10）。

CLI を使う場合（ログイン済みなら）:

```bash
npx vercel login
npx vercel link --yes --project x-idea
npx vercel env pull .env.local
```

### H.5 設定値の対応表（実装の正）

| Settings カラム / JSON キー | 既定 | ON にする人 | ON の条件 |
| --- | --- | --- | --- |
| `x_api_enabled` | 0 | 人間 | X クレジット残あり、スペンディングリミット設定済み |
| `ai_paid_enabled` | 0 | 人間 | Gemini 課金アカウント接続済み |
| `thread_expand_enabled` | 0 | 人間 | `x_api_enabled=1` かつ月次上限を理解した |
| `paid_providers_json.anthropic` | false | 人間 | `ANTHROPIC_API_KEY` 設定済み |
| `paid_providers_json.openai` | false | 人間 | `OPENAI_API_KEY` 設定済み |
| `observability_json.sentry` | false | 人間 | `SENTRY_DSN` 設定済み |
| `ai_paused` | 0 | 人間 | 収集のみにしたいとき 1 |
| `allow_deep_think` | 1 | 人間 | quality レーンを使わないなら 0 |

---

*本書はここまで。実装中に本書と実際の API 挙動・クォータが食い違った場合は、実挙動を正とし、本書の該当箇所（特に 14 章・16.2・付録C・付録H）と ADR を更新してから先に進むこと。*
