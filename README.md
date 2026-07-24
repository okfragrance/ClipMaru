# ClipMaru

Windows 11向けクリップボード管理アプリ。既存ツール「Clibor」の代替として、個人利用目的で開発。
Cliborの不満点(並べ替えにCSV書き出しが必要、書式の扱いが面倒、カテゴリ選択のクセ)を解消しつつ、
19カテゴリ×最大40件規模の大量登録運用に耐える設計。

- 開発者: くにこ(K-Studio3070 / AnnyStation)
- 技術スタック: Tauri v2 + React + TypeScript / SQLite(`tauri-plugin-sql`)/ トレイ・ウィンドウ位置記憶(`tauri-plugin-window-state`)/ ダイアログ・FS(`tauri-plugin-dialog` / `-fs`)
- 仕様の正: [`ClipMaru_handoff.md`](./ClipMaru_handoff.md) / 実装ルール: [`CLAUDE.md`](./CLAUDE.md)

## 機能

常駐アプリ。タスクバー常駐、細長いウィンドウ(幅300px程度)で「表示しながら別ウィンドウで作業する」使い方を想定。

### 履歴タブ
- Windowsのクリップボード変化を自動監視し、コピーするたびに自動で一覧に追加(`clipboard-win` クレートでOSイベントを監視)
- リッチテキスト(HTML)/プレーンテキストの両方を保持。クリックで元の書式のままコピー、リッチ項目のみトグルでプレーン切替も可能
- MRU(最近使った順): 同じ内容を再コピーすると、古い行を消して最新として先頭に統合
- 保持上限500件

### 定型文タブ
- カテゴリ管理(マウスホイールで切替できるダイヤルUI、カテゴリ一覧ポップアップ)
- 見出し+本文を分けて登録。見出しは本文先頭行から自動生成(手動編集も可)
- 区切り線でグループ分け、グループごとに見た目連番のON/OFF
- ドラッグ&ドロップで並べ替え
- 右クリックメニューから追加/削除、複数選択してカテゴリ間移動・まとめて削除

### フォルダタブ
- よく使うフォルダ・ファイル・ショートカット(.exe/.lnk)・URLをピン留めしてワンクリックで開く

### その他
- 常に最前面に表示するトグル
- 配色テーマ切替(クリーム/ダーク)
- 文字フォント切替(丸ゴシック[Zen Maru Gothic 同梱] / システムのゴシック体 / 明朝体)
- 文字サイズ切替(小/中/大、UI全体を段階ズーム)
- Windowsスタートアップ登録(起動時に自動で開く、`tauri-plugin-autostart`)
- 画像履歴(スクリーンショット等のコピーをサムネイル表示、5件・テキストとは別枠)
- バックアップ(カテゴリ・定型文をJSONで保存/復元)
- システムトレイ常駐: ✕で閉じてもトレイに格納、トレイアイコン左クリックで表示/非表示トグル、右クリックメニューから終了。終了時のウィンドウ位置・サイズを記憶して次回復元(`tauri-plugin-window-state`)
- メイン書体 Zen Maru Gothic を同梱(OFL、`public/fonts/`)

## コマンド

```sh
npm install
npm run tauri dev    # 開発起動
npm test              # vitest(コア機構 + phrasebook)
npm run lint          # eslint(toISOString禁止ルール含む)
npm run build         # tsc + vite build
npm run release-check # 出荷前のデバッグ残留チェック
cd src-tauri && cargo test  # safe_write の無傷検証テスト
```

## 開発ルール

このリポジトリは `annystation-template-tauri` をベースに実装しており、
`HOUSE_RULES.md`(コード規約)/ `BRAND_TOKENS.md`(ビジュアル基準)に従う。詳細は [`CLAUDE.md`](./CLAUDE.md) を参照。

- 依存方向: `src/core/`(純関数)← `src/storage/`(SQLite)← `src/app/`(React UI)
- 永続化する状態は `src/core/schema.ts` の `PERSIST_SCHEMA` に登録するだけで save/load/export/import が自動追従
- `src/core/` の `date.ts` / `merge.ts` / `errors.ts` / `session.ts` は検証済みコア機構(改変禁止)
