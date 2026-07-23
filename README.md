# annystation-template-tauri

AnnyStationの新規アプリ用スターターテンプレート(Tauri v2 + React + TypeScript)。
HOUSE_RULES.md の9パターンを「構造的に違反を書けなくする」形で組み込み済み。

## このテンプレの使い方

### 1. clone → リネーム

```sh
git clone <this-repo> my-new-app
cd my-new-app
rm -rf .git && git init
```

以下を新アプリ名に置換する:

- `package.json` … `name`(`package-lock.json` の `name` 2箇所も)
- `src-tauri/Cargo.toml` … `[package] name` と `[lib] name`
  - **`[lib] name` を変えたら `src-tauri/src/main.rs` の `〜_lib::run()` も必ず直す**
    (ここを忘れるとcargoビルドがコンパイルエラーになる)
- `src-tauri/tauri.conf.json` … `productName` / `identifier` / `windows[0].title`
- `index.html` … `<title>`

置換後に通ることを確認:

```sh
npm install
npm run build && npm test
cd src-tauri && cargo test   # Rust側のリネーム漏れはここで出る
```

### 2. schema を書き換える

永続化する状態は **`src/core/schema.ts` の `PERSIST_SCHEMA` に1行足すだけ**。
save / load / snapshot / export / プロフィール切替の全てが自動で追従する。

```ts
export const PERSIST_SCHEMA: readonly FieldDef[] = [
  field("settings", "shared", () => ({ theme: "macaron", soundOn: true })),
  // ↓ あなたのアプリの状態をここに足す。scope("profile"|"shared")は必須(R9)
  field("garden",   "profile", () => ({ plants: [] as string[] })),
];
```

- `_` プレフィックスのキーは保存も復元もされない(表示用キャッシュ専用)
- 状態を追加したら: schemaに登録 → 再起動して残るか実機確認 → export往復確認

### 3. engine を書き換える

`src/core/engine.ts` がアプリ本体ロジックの置き場所(純関数の世界)。
`toSave()` / `fromSave()` / `applyElapsed()` / `checkDailyRollover()` の
4契約を保ったまま中身を実装する。React/Tauri APIのimportは禁止。

### 4. 触ってはいけないファイル

`src/core/` の `date.ts` / `merge.ts` / `errors.ts` / `session.ts` / `schema.ts`(の仕組み部分)は
検証済みコア(`npm test` で25件緑)。**改変禁止**。

## コマンド

```sh
npm install
npm run tauri dev      # 開発起動
npm test               # コア25テスト
npm run lint           # eslint(toISOString禁止を含む)
npm run build          # tsc + vite build
npm run simulate       # 経済シミュレーション雛形
npm run release-check  # 出荷前のデバッグ残留チェック
cd src-tauri && cargo test   # safe_write の破損時無傷テスト
```

## ディレクトリ構成と依存方向

```
src/core/     ← 純関数(改変禁止コア + engine)。何もimportしない側
src/storage/  ← SQLite・安全書き込み・schema駆動save/load。coreのみ参照
src/app/      ← React UI。storage/coreを使う側
src/debug/    ← デバッグ隔離区域(DEVビルド限定・本番でツリーシェイク)
src-tauri/    ← Rust(safe_write_json コマンド等)
```

依存方向は **ui → storage → core** の一方向のみ。逆流はレビューNG。
