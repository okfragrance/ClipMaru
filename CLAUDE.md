# ClipMaru

Windows 11向けクリップボード管理アプリ(既存ツール「Clibor」の代替、個人利用)。
`annystation-template-tauri`(Tauri v2 + React + TypeScript)をベースに実装。

- 仕様書: `ClipMaru_handoff.md`(挙動の正)/ 参照プロトタイプ: `clipboard_prototype_v3.html`
- 開発者: くにこ(K-Studio3070 / AnnyStation)

## ブランド階層(表記を間違えない)

- **AnnyStation** = 会社・屋号。綴りは `Anny`(**Annie / アニーステーションは誤記**)。
  House Rules(下記)は会社標準で、レーベルを問わず全プロジェクト共通。
- **K-Studio3070** = アプリ開発レーベル。`BRAND_TOKENS.md` のビジュアル基準は
  このレーベル固有の層で、別レーベルを立てるときはトークン層だけ差し替える。
- 階層の正は `BRAND_TOKENS.md` 冒頭の「0. ブランド階層」。

---

## House Rules R1–R9(AnnyStation標準・全文は `HOUSE_RULES.md`)

要約。**根拠(6アプリ横断レビューで見つかった9パターンの実例)と全文は `HOUSE_RULES.md`**。
判断に迷ったら第1部(なぜそのルールがあるか)を読む。

- **R1 ストレージ方針を最初に1つ選ぶ**: Tauriは `tauri-plugin-sql`(SQLite)一択。
  localStorage/sessionStorage に実データを置かない。バックアップ/同期をやるなら
  削除の tombstone を初日からスキーマに入れる。エクスポートを作るなら同形式の
  インポートも同時に作る(往復保証)。
- **R2 永続化はスキーマ駆動・キー一覧は1箇所だけ**: `src/core/schema.ts` の
  `PERSIST_SCHEMA` が唯一の定義。save/load/snapshot/export/import は全員ここを
  ループするだけ。手書きの collect/apply 列挙を書いた時点で違反。表示用キャッシュは
  `_` プレフィックスで統一し保存時に機械除外。
- **R3 日付ユーティリティを最初に作る**: 日付キーは `src/core/date.ts` の
  `todayKey()`(ローカル `YYYY-MM-DD`)のみ。`toISOString().slice(0,10)` と
  `MM-DD` は全面禁止(eslintで機械検出)。日次リセットは起動時だけでなく
  「日付が変わり得る全ての瞬間」でチェック。
- **R4 「アプリが見ていない時間」を設計してから実装**: `lastSeen` を刻めるのは
  `SessionClock` だけ。ライフサイクル配線は `useLifecycle` の1箇所のみ
  (他所で visibilitychange/focus を購読して lastSeen や早送りに触ったら違反)。
- **R5 コアロジックはUIから分離**: ゲーム/ビジネスロジックは純関数の
  `src/core/engine.ts`(React/Tauri/タイマー/ストレージを import しない)。
  `toSave()/fromSave()` でJSONスナップショットを出す。テストとシミュレーションが
  同じエンジンを叩ける構造にする。
- **R6 報酬・経済は付与記録+シミュレーション**: 付与は `RewardLedger.grantOnce()`
  経由でべき等に。`coins += / xp +=` の直書き禁止。レベル・進行度は累計値から導出。
  数式を決めたらリリース前に数ヶ月分シミュレーションを走らせる。
  ※ ClipMaru は経済要素なし(R6は該当なし)。
- **R7 削除・キャンセルの原則**: 破壊的な副作用(ファイル/DB削除)は「確定(保存)時」
  にまとめて実行。編集中・選択中には実行しない。キャンセルは副作用ゼロ。エンティティ
  削除時は関連リソースも同時に消すチェックリストをスキーマに併記。
- **R8 モック・デバッグは見た目で分かる形でしか書かない**: モックは `MOCK_`、
  デバッグは `DEBUG_` プレフィックス必須。デバッグ機能は `src/debug/` 配下 +
  `import.meta.env.DEV` ガード。リリース前 `npm run release-check` で grep。
- **R9 多重データは全キー分類表を先に**: プロフィール/スロットを作るなら全状態キーに
  「分離する/共有する」を `PERSIST_SCHEMA` の `scope` で宣言してから実装。
  ※ ClipMaru は単一ユーザーで多重データなし。全フィールド `scope: "shared"`。

### 実装中チェックリスト(`HOUSE_RULES.md` 第3部)

状態を1つでも追加/変更したら:
1. `PERSIST_SCHEMA`(R2の一覧)に登録したか
2. **アプリを再起動して値が残ることを実機確認**したか(全アプリ共通の最頻出穴)
3. エクスポート/インポートで往復できるか
4. 保存データに表示用キャッシュ・巨大文字列が混入していないか
5. `JSON.parse` に try-catch(1キー破損で起動不能にならないか)があるか

---

## ビジュアル基準 B1–B7(全文は `BRAND_TOKENS.md`)

House Rulesの「構造で縛る」思想はビジュアルにも適用する。`BRAND_TOKENS.md` がソース、
実装は `src/app/theme.css`(CSS変数)と `src/app/components/CurrencyChip.tsx`(署名パーツ)。

- **B1 パレット**: ベース背景=クリーム系(`#FAEBD4`〜`#FFF9F5`)、アウトライン/濃色=
  焦げ茶(`#3A2A26`)。アクセントはパティスリー4色(いちご `#E0567A`/ピスタチオ
  `#E3EFCB`/レモン `#FEE294`/ラベンダー `#EAD9F8`)。
- **B2 署名パーツ3点**: ①アウトライン(`2px solid #3A2A26`)+ハードドロップシャドウ
  (offset 3〜4px・ぼかし0)②角丸スケール(カード16 / ボタン12 / チップ999 /
  小アイコン10px)③通貨チップ(アイコン+数値を角丸ピルに内包、右上固定)。
- **B3 タイポ**: メイン書体は丸ゴシック(`Zen Maru Gothic` 等)に統一。見出し/ボタンは太字。
- **B4 アイコン**: 線画+パステル塗り、輪郭線は焦げ茶固定。フラット〜セミフラット。
- **B5 逸脱ルール**: ゲーム演出は逸脱可だが、アウトライン色(焦げ茶系)・彩度レンジ・
  構造パターン(通貨チップ/角丸ピル)は死守。
  **B5-2 ライフスタイル/ジャーナル系枠**: 「静かで上質」を狙うユーティリティ系は
  B2の焦げ茶太アウトライン+ハードシャドウを要求しない。維持すべきは
  ①クリームベースファミリー ②メイン書体 Zen Maru Gothic の2点のみ。柔らかいブラー影・
  独自署名パーツ・落ち着いた暖色アクセントは許容。
- **B6 実装メモ**: Tauri/Reactは `theme.css` にHEXをCSS変数化。署名パーツはコンポーネント化。
- **B7 未確定**: メイン書体の正式決定・アクセント色の最終調整は追って詰める。

### ClipMaru のテーマ運用(B5-2 枠として扱う)

ClipMaru は実用ユーティリティなので **B5-2(ライフスタイル/ジャーナル系枠)** を適用。

- CSS変数はプロトタイプ設計を踏襲し(`--cream` / `--ink` / `--accent` / `--sub` /
  `--border` / `--rich-tag` / `--plain-tag` 等)、`src/app/theme.css` に ClipMaru の
  トークン層として定義する。**コンポーネントにHEX値やpx値を直書きしない**(B6)。
- テーマ切替(§5)はこの変数セット単位で差し替える。ダーク相当を最低1つ用意。
- パレット・値を変えるときは先に `BRAND_TOKENS.md` を更新してから `theme.css` に反映。

---

## データモデル(この設計の正)

R1(SQLite)/ R2(スキーマ駆動)に従い、ドメインを2つに分ける。根拠は仕様書 §4
(バックアップ対象は「カテゴリ・定型文」のみ・履歴は対象外)。

| ドメイン | 保存先 | 理由 |
|---|---|---|
| カテゴリ + 定型文 | `PERSIST_SCHEMA` の `categories` フィールド(`kv` にJSON) | 件数は有限(19×40規模)。§4バックアップが `exportJson/importJson` で自動的にR2準拠・往復保証つき |
| フォルダ/ショートカット(ピン留め一覧) | `PERSIST_SCHEMA` の `folders` フィールド(`kv` にJSON) | 仕様書にはない追加機能(ユーザー提案)。件数は少数想定なので categories と同じ配列フィールド化でR2準拠・バックアップ自動対応。`tauri-plugin-opener` の `openPath`/`openUrl` で開く(`opener:allow-open-path` を capabilities に追加済み) |
| 履歴 | 専用 relational テーブル `history`(`db.ts` v2) | クリップボード変化ごとに追記(高頻度)・500件で古いものを自動削除・§4でバックアップ対象外 |

- `categories` は**1つの配列フィールド**で、各カテゴリが `items: PhraseItem[]` を内包する。
  `deepMerge` は配列を丸ごと置換・**オブジェクトの未知キーは捨てる**ため、動的キーの
  Map(`{catId: items}`)にすると復元時に全消えする。配列内包なら無傷で復元できる。
- 並び順は**配列のindex**で表現(`order` 列は持たない)。
- 「グループN」自動採番・見た目連番は**保存せず** `phrasebook.ts` の純関数で描画時に導出
  (仕様: 見た目だけ・コピー内容や編集パネルには一切含めない)。
- 履歴はリッチ/プレーン両方を保持し、コピー時に `format==='rich' && !force_plain` なら
  リッチ、他はプレーンを書き込む(§技術検討2)。
- 履歴上限 = **500件**(`HISTORY_CAP`)。**MRU方式**: 同一内容を再コピーすると古い行を削除し
  最新として先頭に追加する(同一内容が履歴内に複数行残らない)。
- 画像履歴(`format='image'`) = **5件**(`IMAGE_CAP`、テキストとは別カウント)。
  実データは `blobs` テーブルへ、`history.blob_id` が参照するだけ(R1: 本文には参照IDのみ)。
  `blobs.data` は列宣言こそ `BLOB` だが実際に書き込むのは **base64文字列**(SQLiteは動的型付けで
  列宣言はヒントに過ぎず、TEXT値をBLOB宣言列に入れても問題ない)。理由:
  `tauri-plugin-sql` の `execute()` はJSの値が配列だと生の `JsonValue` としてbindされ
  失敗する(BLOBへの自動変換経路が無い)ため、文字列としてbindできるbase64が唯一実用的な経路。
  読み取り側もこのプラグインの列→JSON変換が「クエリ結果列の**宣言型**」で分岐する
  (実行時の値の型ではない)仕様のため、`blobs.data` は常に `Vec<u8>` 経由の数値配列で
  返ってくる。書き込んだのはbase64(ASCIIのみ)なので、その配列をUTF-8バイト列とみなし
  `TextDecoder` で復元すればロスレスで元のbase64文字列に戻る(詳細は `historyStore.ts` 冒頭コメント)。
- 画像の**書き込み**(コピー実行)だけは `navigator.clipboard.write()` を使わず、
  Rustの専用コマンド `write_clipboard_image`(`src-tauri/src/commands/clipboard_write.rs`)
  経由で `clipboard-win` に直接書き込む。理由: WebView2の Async Clipboard API は
  画像書き込みのサポートが不完全/不安定(実機で失敗を確認)。プレーン/リッチは
  WebView側のAPIで問題なく動くため、画像だけこの例外。

### 主要ファイル

- `src/core/types.ts` … `Category` / `PhraseItem`(`PhraseEntry`|`DividerEntry`) / `FolderEntry`
- `src/core/schema.ts` … `PERSIST_SCHEMA`(settings / categories / folders / session)※触るのはこの定義だけ
- `src/core/engine.ts` … 純関数エンジン(カテゴリ・定型文・フォルダの編集ロジック)
- `src/core/phrasebook.ts` … `autoLabel` / `computeCategoryView`(採番導出)などの純関数
- `src/storage/db.ts` … SQLiteマイグレーション(v2で `history` 追加)
- `src/storage/historyStore.ts` … 履歴の追記・列挙・トグル・削除(500件上限)
- `src/storage/opener.ts` … フォルダ/ファイル/.exe/.lnk/URL を開く(`tauri-plugin-opener`)
- `src/storage/clipboard.ts` … クリップボード書き込み(プレーン/リッチ)
- `src-tauri/src/clipboard_watcher.rs` … `clipboard-win`(Windows専用)でクリップボード監視。
  変化のたびに `"clipboard-changed"` イベントをemit。読み取り専用(書き込みはフロント側)
- `src/app/hooks/useClipboardWatcher.ts` … 上記イベントを購読し `HistoryStore.add()` へ

---

## このリポジトリ固有の注意

- `src/core/` の date.ts / merge.ts / errors.ts / session.ts は**検証済みコア機構
  (vitest緑)。改変禁止**。バグを見つけたら報告のみ。
- `schema.ts` / `engine.ts` / `scripts/simulate.ts` は「アプリごとに書き換える」と
  明記された箇所。`schema.ts` で触ってよいのは `PERSIST_SCHEMA` 定数のみ。機械部分
  (`field` / `defaultState` / `validateSchema`)とそのテストは不変で維持する。
- localStorage / sessionStorage を実データに使うコードを書かない(R1)。
  実データはSQLite(`storage/db.ts`)一択。
- 完全なファイル出力で作業する(差分パッチ不可)。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` / `npm run tauri dev` | 開発起動 |
| `npm run build` | tsc + vite build |
| `npm test` | vitest(コア機構 + phrasebook) |
| `npm run lint` | eslint(toISOString禁止ルール含む) |
| `npm run release-check` | デバッグ残留grep(出荷前必須) |
| `cargo test`(src-tauri内) | safe_write の無傷検証テスト含む |
