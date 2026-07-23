// eslint.config.js
// 【House Rule R3】toISOString を物理的に封じる。
// 日付キーの生成手段は core/date.ts の todayKey() だけ。

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "src-tauri/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // scripts/ のNode実行ファイル(.mjs)にはNodeグローバルを許可
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='toISOString']",
          message:
            "日付キーには core/date.ts の todayKey() を使うこと(House Rule R3)",
        },
      ],
      // 【R1】実データはSQLite一択。localStorageを触るコードを書かない
      "no-restricted-globals": [
        "error",
        {
          name: "localStorage",
          message: "実データはSQLite(storage/db.ts)を使うこと(House Rule R1)",
        },
        {
          name: "sessionStorage",
          message: "実データはSQLite(storage/db.ts)を使うこと(House Rule R1)",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "window",
          property: "localStorage",
          message: "実データはSQLite(storage/db.ts)を使うこと(House Rule R1)",
        },
        {
          object: "window",
          property: "sessionStorage",
          message: "実データはSQLite(storage/db.ts)を使うこと(House Rule R1)",
        },
      ],
    },
  }
);
