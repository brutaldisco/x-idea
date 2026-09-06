# ADR-012: アプリゲートに Google ログインを足す

- 日付: 2026-09-06
- 状態: 採用
- 関連: 設計書 14.2 / 28.1 / T-214、ADR-002

## 文脈

個人利用で、開発環境や Cursor 内ブラウザからも同じ本番データを開きたい。パスキーは埋め込みブラウザで使えないことが多い。メールマジックリンクは送信サービスが要る。データ共有自体は Turso で足りるが、扉の確認を Google アカウントに寄せたい。

## 決定

- `user_id` は追加しない。許可メールは環境変数 `ALLOWED_GOOGLE_EMAIL` の 1 件。
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `ALLOWED_GOOGLE_EMAIL` が揃ったときだけ Google ゲートを有効にする。
- 成功時は既存の `marginalia_gate` Cookie（署名のみ、1 年）。Google トークンは保存しない。
- `APP_PASSCODE` は残す。Cursor 内ブラウザが Google に弾かれたときの逃げ道。
- どちらも未設定なら、従来どおりゲートなし。

## 影響

- `/unlock` に「Google で続ける」を出す。設計書の「ログイン UI なし」は「ユーザー登録なし・ゲートは任意」に読み替える。
- Google Cloud の OAuth クライアント（無料）が要る。Clerk やメール送信サービスは使わない。
