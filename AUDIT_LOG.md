# AUDIT_LOG

HOUSE_RULES.md 第3部チェックリスト + BRAND_TOKENS.md B2/B5 を基準とした監査の記録。
新しい監査ほど上に追記する。次回は `/recheck` で直近タグからの差分だけを再監査する。

## audit-20260916 (2026-09-16)
コミット: fbf6a67

初回監査（基準点の作成）。監査 v2-A（House Rules 差分 + BRAND_TOKENS 乖離 + capabilities）。対象: `src/` / `src-tauri/` 全体。
実測: `npm test` 46件緑（core 機構 + phrasebook）、`npm run lint` クリーン（toISOString / localStorage 禁止ルール込み）、
`npm run release-check` クリーン、`tsc --noEmit` クリーン。

### 良かった点（回帰させないこと）
- R2: `PERSIST_SCHEMA`（`src/core/schema.ts`）を save / load / export / import の全員がループするだけ。手書き列挙なし。
- R1: SQLite 一択。`db.ts` のマイグレーションは 1件 = 1トランザクション（`BEGIN … PRAGMA user_version … COMMIT`）で半端適用が起きない。
  画像は `blobs` に分離し `history.blob_id` で参照。エクスポートと同形式のインポートが揃っている（`App.tsx:186-230`）。
- R4: `useLifecycle.ts` の1箇所だけが visibilitychange / blur / focus を購読し、`pauseTimers → markSeen → save` の順序を守る。
- R7: 削除は `window.confirm` 経由（`PhrasesTab.tsx:159,164,194` / `FoldersTab.tsx:75` / `CategoryPanel.tsx:77`）。カテゴリ削除で配下の定型文も消える（items 内包）。
- R8: `src/debug/cheats.ts` は `import.meta.env.DEV` ガード。
- R10: バックアップ書き出しは Rust の `safe_write_json`（tmp → 読み戻し検証 → rename）。

### Critical
- なし

### Warning
- **W-1** B6 HEX 直書き — `src/app/App.tsx:293,304` の `#4CAF50`（ピン留めの緑）、`src/app/components/RestoreNotice.tsx:17,18,27` の `#fff3cd` / `#ffc107` / `#666`。
  CLAUDE.md の「コンポーネントに HEX 値を直書きしない」に反する。`theme.css` の変数（`--accent` / `--accent-soft` / `--sub`、必要なら `--success` を新設）に寄せる。
- **W-2** `HOUSE_RULES.md` が旧版（R10〜R12 と根拠2行目が無い）。正本は「バイト単位で同一」が約束。`/sync-rules` で更新。
- **W-3** `src-tauri/capabilities/default.json` — `fs:scope` が `**`、加えて `fs:allow-write-text-file`。フロントの fs 利用は dialog で選んだパスの
  `readTextFile` 1箇所（`App.tsx:213-219`）だけで、書き込みは Rust コマンド経由。dialog プラグインが選択パスを実行時 scope に足すので
  `fs:scope **` と `fs:allow-write-text-file` は外せる。`opener:allow-open-path **` はフォルダ機能の要件なので妥当。`csp: null` は既定のまま。

### Nits（記録のみ）
- `src/app/components/CurrencyChip.tsx` はテンプレ由来で未使用（ClipMaru に通貨表示は無い）。R11 の雛形残骸。
- `src/app/theme.css:2` のコメントが「v0.1」のまま（BRAND_TOKENS.md は v0.2 に同期済み）。
- インライン `style={{}}` が 116箇所あり px 直書きを含む。B5-2 枠なので違反ではないが、色だけは変数経由を徹底する。

