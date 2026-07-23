# annystation-template-tauri

AnnyStation標準スターターテンプレート(Tauri v2 + React + TypeScript)。

## ブランド階層(表記を間違えない)

- **AnnyStation** = 会社・屋号。綴りは `Anny`(**Annie / アニーステーションは誤記**)。
  House Rules(下記)は会社標準で、レーベルを問わず全プロジェクト共通。
- **K-Studio3070** = アプリ開発レーベル。`BRAND_TOKENS.md` のビジュアル基準は
  このレーベル固有の層で、別レーベルを立てるときはトークン層だけ差し替える。
- 階層の正は `BRAND_TOKENS.md` 冒頭の「0. ブランド階層」。

## 本プロジェクトのHouse Rules(AnnyStation標準)

以下は要約。**全文と根拠(6アプリの横断レビューで見つかった9パターンの実例)は
同階層の `HOUSE_RULES.md`**。判断に迷ったらそちらの第1部(なぜそのルールがあるか)を読む。

1. 依存方向は ui → storage → core のみ。core/はFlutter/React/Tauri APIをimportしない
2. 永続化は core/schema にフィールドを足すだけ。save/load/snapshot/exportに個別コードを書かない
3. 日付キーは todayKey() のみ。toISOString/toUtc由来の日付キー禁止
4. lastSeenを書けるのはSessionClockだけ。ライフサイクル配線はlifecycle_binder(useLifecycle)の1箇所
5. 報酬付与はRewardLedger.grantOnce()経由のみ。coins += の直書き禁止
6. 削除の実行はPendingChanges.commit()のみ。キャンセルは副作用ゼロ
7. デバッグ機能はdebug/配下+ビルドフラグガード必須
8. 状態を追加/変更したら: schemaに登録→再起動して残るか実機確認→export往復確認

## ビジュアル基準(BRAND_TOKENS.md)

House Rulesの「構造で縛る」思想はビジュアルにも適用する。ルート直下の
`BRAND_TOKENS.md` がソースで、実装は `src/app/theme.css`(CSS変数)と
`src/app/components/CurrencyChip.tsx`(署名パーツ)。

- 色・角丸・シャドウは `theme.css` のCSS変数/ユーティリティクラス
  (`.k3070-outline-shadow` 等)経由で使う。コンポーネントにHEX値やpx値を直書きしない
- パレット・値を変える場合は先に `BRAND_TOKENS.md` を更新してから `theme.css` に反映する
- 通貨・スコア表示は `CurrencyChip` を使う(独自実装しない)

## このリポジトリ固有の注意

- `src/core/` の date.ts / merge.ts / errors.ts / session.ts / schema.ts は
  **検証済みコア(vitest 25件緑)。改変禁止**。バグを見つけたら報告のみ。
- localStorage / sessionStorage を実データに使うコードを書かない(R1)。
  実データはSQLite(`storage/db.ts`)一択。
- 完全なファイル出力で作業する(差分パッチ不可)。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` / `npm run tauri dev` | 開発起動 |
| `npm run build` | tsc + vite build |
| `npm test` | vitest(コア25件) |
| `npm run lint` | eslint(toISOString禁止ルール含む) |
| `npm run simulate` | 経済シミュレーション(engine直叩き) |
| `npm run release-check` | デバッグ残留grep(出荷前必須) |
| `cargo test`(src-tauri内) | safe_write の無傷検証テスト含む |
