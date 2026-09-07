# 設計書：多言語の原文検出と「日本語に翻訳」ボタン

- 日付: 2026-09-07
- 状態: **提案（実装前。承認後に T-613 として着手）**
- 関連: ADR-006、実装設計書 8.5（SC-06 Reader）、`src/lib/chrome-translate.ts`、`src/components/ChromeTranslate.tsx`、`src/components/ArticleBlock.tsx`
- 外部情報の確認日: 2026-09-07（[Chrome Translator API](https://developer.chrome.com/docs/ai/translator-api)、[MDN Translator / Language Detector](https://developer.mozilla.org/en-US/docs/Web/API/Translator_and_Language_Detector_APIs/Using)）

## 1. 背景（実挙動）

Reader の記事ブロックでは、英語本文だと「日本語に翻訳」が出るが、中国語本文では出ない。同じ Chrome 翻訳導線（ADR-006）を使っている投稿本文でも、漢字だけの中国語は同様に隠れる。

これは翻訳モデル不足ではなく、**ボタン表示前のヒューリスティックが漢字を日本語と誤認する**ことが主因。加えて記事側は **投稿の `lang` を流用**しており、クリック後の翻訳も失敗しうる。

## 2. 現状の流れ

```
ArticleBlock / PostBlock
  → shouldOfferTranslate(text, lang)   // 同期。ここでボタンの有無が決まる
  → クリック時 detectSourceLanguage(text, primaryLanguage(lang))
  → Translator.create({ sourceLanguage, targetLanguage: "ja" })
```

- 翻訳結果は画面の一時表示のみ。DB / AI カラムには書かない（ADR-006。維持）。
- 記事の `articles` テーブルに言語カラムは無い。`ArticleBlock` は `lang={source.post.lang}` を渡している。
- `sources.language` は enrich 用で、未設定時は `"ja"` に落ちる。記事言語の正本には使えない。

## 3. 原因

### 3.1 ボタンが消える（主因）

`looksMostlyJapanese` がひらがな・カタカナに加え、**CJK 統合漢字 `\u4e00-\u9fff` を日本語文字として数える**。

```ts
const jp = chars.filter((char) =>
  /[\u3040-\u30ff\u4e00-\u9fff]/u.test(char),
).length;
return jp / chars.length >= 0.35;
```

中国語本文はほぼ漢字なので、35% 閾値を必ず超える。`shouldOfferTranslate` は `lang` より先にこの判定で `false` を返す。

| 本文 | 現状 | あるべき姿 |
| --- | --- | --- |
| 英語（ラテン） | ボタンあり | あり |
| 中国語（簡体・繁体） | **なし** | あり |
| 日本語（かな交じり） | なし | なし |
| 韓国語（ハングル） | あり（ハングルは範囲外） | あり |
| その他（タイ・アラビア・キリル等） | あり | あり |

つまり「他言語を検出していない」のではなく、**漢字圏だけを日本語に誤分類している**。ラテン・ハングル・その他スクリプトは既にボタン対象。

### 3.2 記事に投稿 `lang` を流用（副因・クリック失敗）

日本語ツイートから中国語記事を開いた場合:

1. 表示判定は 3.1 で既に落ちる。
2. 3.1 だけ直しても、`detectSourceLanguage` は **hint があれば Detector を使わない**。
3. hint が `ja` だと `source === "ja"` になり、「言語を特定できませんでした」で終わる。

記事の言語と投稿の言語は独立している。記事に投稿 `lang` を渡してはいけない。

### 3.3 `primaryLanguage` が `zh-Hant` を潰す

`primaryLanguage("zh-Hant")` / `"zh-TW"` は先頭だけ残して `"zh"` にする。Chrome Translator は次のコードを使う。

| コード | 意味 |
| --- | --- |
| `zh` | 中国語（簡体） |
| `zh-Hant` | 中国語（繁体） |

繁体を簡体として渡すと、品質低下か pair unavailable になりうる。表示判定とは別レイヤの制約。

## 4. 確定したい方針

ADR-006 は維持する。サーバー翻訳・AI 予算・原文カラム書き換えはしない。

1. **ボタン表示は「日本語ではなさそうか」だけを見る。** 対応言語のホワイトリストは表示条件に使わない（未対応言語はクリック後に「原文を選択」へ落とす既存経路）。
2. **漢字だけでは日本語とみなさない。** ひらがな・カタカナが一定以上あるときだけ日本語。
3. **記事は投稿 `lang` を使わない。** 本文から判定し、クリック時は Language Detector に任せる。
4. **Translator に渡すコードは pair 用に正規化する。** `zh-Hant` は残す。`zh-Hans` / `zh-CN` は `zh`。
5. **翻訳結果は保存しない。** 言語ヒントを DB に足すのも Phase 1 ではやらない。

## 5. 設計

### 5.1 文字種ヒューリスティック（同期・ボタン表示）

`src/lib/chrome-translate.ts` を次の意味に組み替える。

| 関数 | 役割 |
| --- | --- |
| `looksMostlyJapanese(text)` | 非空白のうち、ひらがな `\u3040-\u309f` ＋カタカナ `\u30a0-\u30ff`（長音 `ー` を含む）の割合 ≥ 0.12。漢字は数えない。短文（8 未満）はかな 1 字以上なら日本語 |
| `shouldOfferTranslate(text, lang)` | 空／2 字未満 → 否。かな優勢 → 否。`lang` の primary が `ja` かつ **かな優勢** なら否（漢字だけ＋`lang=ja` では否にしない）。それ以外は **はい** |
| `translatorLanguage(lang)` | Translator pair 用。`zh-Hant` / `zh-TW` / `zh-HK` → `zh-Hant`。`zh-Hans` / `zh-CN` / `zh` → `zh`。他は primary（`en-US` → `en`）。`und` / `zxx` は null |
| `primaryLanguage` | HTML `lang` 属性用。従来どおり primary。`translatableProps` は繁体だけ `zh-Hant` を残す |

400 字を超える日本語記事にかなが無いことは practically 起きない。漢字だけの短題（「東京都知事選」）は false positive でボタンが出うるが、クリック後 Detector が `ja` なら既存の「特定できません」hint で足りる。記事は `LONG_ARTICLE = 400` で本文が付くため、実害は小さい。

### 5.2 記事と投稿で hint を分ける

| 面 | `ChromeTranslate` の `lang` |
| --- | --- |
| 投稿（`PostBlock`） | `x_posts.lang`（X API）。中国語投稿は `zh` / `zh-cn` 等。表示は本文ヒューリスティック優先なので、`lang=zh` の漢字本文でもボタンは出る |
| 記事（`ArticleBlock`） | **常に `null`**。クリック時に Language Detector が本文を見る |

`translatableProps` の記事 `lang` も投稿に依存させない。未検出なら `lang` 属性なし＋`translate="yes"`。Detector 後に DOM を書き換えない（一時表示の対訳ブロックで足りる）。

### 5.3 クリック時の言語解決

`detectSourceLanguage` を次の順にする。

1. 本文を Language Detector にかける（あれば）。confidence が低い／`ja` のときは hint を検討。
2. hint（投稿 `lang` を正規化したもの）が `ja` 以外ならそれを使う。
3. hint しか無く Detector が無いときは hint を使う。
4. どちらも `ja` / null なら既存どおり「原文を選択」へ。

**記事は hint が null** なので、Desktop Chrome では Detector → Translator。Detector が無い環境は「原文を選択」＋右クリック翻訳（ADR-006 のフォールバック）。

Translator には `translatorLanguage(detected)` を渡す。`zh-Hant` を潰さない。`availability === "unavailable"` のときは既存 hint（右クリック誘導）。未対応言語をサーバー翻訳に回さない。

### 5.4 対象面

Phase 1 で直すのは Reader だけ（設計書 8.5）。

- `ArticleBlock`（報告の再現箇所）
- `PostBlock`（同じ `shouldOfferTranslate`）
- `ChromeTranslate` の検出順

Inbox / Library カードに翻訳ボタンは置かない（現状どおり）。

### 5.5 やらないこと（Phase 1）

- `articles.lang` カラムや `article_fetch` での `html[lang]` / `og:locale` 抽出（マイグレーションが要る。HTML の `lang` は不正確なことが多い）
- AI enrich での言語再判定（予算レーンを使う。ADR-006 に反する）
- 翻訳結果の永続化
- サーバー側翻訳 API、有料トグル
- ボタン表示のための Language Detector（非同期・初回モデル DL・モバイル非対応。ちらつきが出る）
- 「対応 39 言語だけボタン」ホワイトリスト（未対応言語でも右クリック経路は残す）

Phase 2（必要なら）: `article_fetch` で `html lang` / `Content-Language` をメタとして保存し、hint にする。原文カラムは触らない。

## 6. 実現性

| 項目 | 判定 | 理由 |
| --- | --- | --- |
| Phase 1（ヒューリスティック＋hint 分離＋`zh-Hant`） | **高い** | クライアント数ファイル。DB / ジョブ / AI なし。既存テストを拡張すれば足りる |
| 中国語記事でボタンが出る | **高い** | 漢字を日本語カウントから外すだけで再現ケースは解消する |
| クリックして中国語→日本語が通る | **Desktop Chrome では高い** | 公式 pair に `zh` / `zh-Hant` → 任意ターゲット（`ja` 含む）がある。初回は言語パック DL |
| モバイル / Safari / Firefox | **ワンクリックは不可** | API は Chrome desktop のみ。フォールバックは「原文を選択」 |
| 全言語の自動検出ボタン | **表示は高い / 翻訳成功は条件付き** | 表示は「日本語以外」。成功は Chrome の 39 言語＋パック DL＋Desktop |
| 記事言語のサーバー保存 | **中** | できるが Phase 1 には不要。HTML `lang` の精度も低い |

**結論**: 報告の「中国語でボタンが出ない」は Phase 1 だけで直せる。他言語のボタンも、漢字誤認を除けば既に出ている。追加で必要なのは記事 hint の切断と、繁体コードの保持。

## 7. 技術制約

### 7.1 Chrome Translator / Language Detector

- **Desktop Chrome のみ**（公式。モバイル Chrome は非対応のことがある）。
- 対応コード（2026-09-07 確認）: `ar bg bn cs da de el en es fi fr he hi hr hu id it ja kn ko lt mr nl no pl pt ro ru sk sl sv ta te th tr uk vi zh zh-Hant`（39）。
- pair はオンデマンド DL。`availability` は `available` / `downloadable` / `downloading` / `unavailable`。
- 言語一覧の動的取得 API は未提供（Chrome 側 issue #68）。ハードコード一覧は陳腐化するので、表示条件には使わず `availability` で落とす。
- Detector は短文に弱い。記事本文（最大 12,000 字）は十分な長さ。投稿の短文は自信度が落ちうる。
- Detector は `zh-Hans` / `zh-Hant` を返しうる。Translator は簡体が `zh`。**マップが必須**。
- Worker では使えない。クライアントコンポーネントのままでよい。
- 初回 DL はユーザー操作（クリック）起点。表示判定で Detector を動かさない（指紋・待ち・Permissions の面でも安全）。

### 7.2 日本語と中国語の重なり

漢字は日中で共有される。かな無しの短文は言語を決め切れない。

- 長い記事: かな無し → 中国語寄り、としてボタンを出す（採用）。
- 投稿の短文: X の `lang` を hint にし、表示はかな判定優先。`lang=zh` ならボタンあり。
- かな交じりの中国語引用（稀）: かな優勢ならボタン無し。許容する誤判定。

サーバー側の言語判定ライブラリは入れない（バンドル・メンテ・ADR-006 の範囲外）。

### 7.3 製品・規約

- 原文（`x_posts.text` / `articles.content_*`）は書き換えない。
- AI レーン・予算を使わない。
- X の非公式翻訳エンドポイントは使わない（ADR-006）。
- 翻訳文を enrich / FTS / 埋め込みに入れない。

### 7.4 既存の長さ制限

- 記事の翻訳入力は先頭 12,000 字。長文の後半は訳されない。
- 400 字以上はボタンを本文の上に置く（既存）。表示条件そのものではない。

## 8. 代替案と不採用理由

| 案 | 内容 | 不採用理由 |
| --- | --- | --- |
| A. 漢字を残したまま閾値だけ上げる | 中国語はほぼ 100% 漢字なので解消しない | 主因を触らない |
| B. 表示前に Language Detector | 正確 | 非同期・DL・モバイル不可・ちらつき。Phase 1 に過剰 |
| C. `article_fetch` で `html[lang]` 保存 | hint の精度が上がることがある | マイグレーション必須。誤った `en` が残るページも多い。Phase 2 |
| D. Gemini で言語判定 | 精度は高い | `budget.guard` 必須。ADR-006 の「自前 AI を使わない」に反する |
| E. 対応言語ホワイトリストでボタン制御 | 未対応を隠せる | 一覧が変わる。未対応でも右クリック経路は有用 |
| F. サーバー翻訳（Cloud / DeepL） | モバイルでもワンクリック | 送信・料金・キー。方針外 |

## 9. 実装タスク案（承認後）

提案 ID: **T-613**（35 章レーン D / Reader 追随）。依存: T-207（Reader 既存）。

DoD:

- [ ] `looksMostlyJapanese` が中国語サンプルで `false`、日本語かな交じりで `true`
- [ ] `shouldOfferTranslate` が中・英・韓・その他で `true`、日本語本文で `false`
- [ ] `ArticleBlock` が投稿 `lang` を翻訳 hint に渡さない
- [ ] `translatorLanguage("zh-Hant") === "zh-Hant"`、`translatorLanguage("zh-CN") === "zh"`
- [ ] クリック時、hint=`ja` でも Detector が中国語なら翻訳に進む
- [ ] 翻訳結果を DB に書かない（回帰）
- [ ] ADR-006 に「漢字≠日本語」「記事は投稿 lang を使わない」を追記
- [ ] 設計書 8.5 の Chrome 翻訳一文を同じ内容に更新

受け入れ条件: 既存 A-04（Reader 目視）の延長。中国語記事でボタンが見え、Desktop Chrome で対訳が出る。日本語記事ではボタンが出ない。

## 10. テスト計画（実装時）

単体（必須）:

- 中国語（簡体・繁体）、日本語、英語、韓国語、混在（日本語ツイート文＋中国語引用は投稿側のケース）
- `translatorLanguage` の BCP 47 マップ
- `shouldOfferTranslate("これは日本語です。", "en")` は従来どおり `false`

手動（実装 PR）:

- Desktop Chrome で中国語記事 → ボタン → 対訳
- 繁体記事 → `zh-Hant` pair（初回 DL あり）
- 日本語記事 → ボタンなし
- Translator 非対応ブラウザ → 「原文を選択」のみ
